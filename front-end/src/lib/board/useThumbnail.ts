"use client";

// Keeping the My Boards tile (§10.15) up to date.
//
// Three legs, and the image never touches our API: ask the server to sign an
// upload, post the PNG straight to Cloudinary, then tell the server which asset
// is now the thumbnail. back-end/src/media/cloudinary.ts explains why — no
// multipart body through Express, and a public id that is a pure function of
// the board, so a signature cannot be pointed at someone else's asset.
//
// Failure here is always silent. A thumbnail is decoration on another page; a
// board that interrupts drawing to report that its preview didn't upload would
// be worse than one with no preview.

import { useEffect, useRef } from "react";
import type * as Y from "yjs";
import { setBoardThumbnail, signThumbnailUpload } from "@/lib/api/boards";
import type { UploadSignature } from "@/lib/api/types";
import { LOCAL } from "@/lib/realtime/board-session";
import { renderThumbnail, toPngBlob } from "./thumbnail";

/**
 * Long enough that it never fires mid-session on a board being actively drawn
 * on, since every save re-uploads the whole image.
 */
const IDLE_MS = 5000;

export function useThumbnail(doc: Y.Doc | null, boardId: string): void {
  const signature = useRef<UploadSignature | null>(null);

  useEffect(() => {
    if (!doc || doc.isDestroyed) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let dirty = false;
    let inFlight = false;
    let cancelled = false;

    const save = async () => {
      timer = null;
      if (inFlight || !dirty || cancelled) return;
      inFlight = true;
      dirty = false;

      try {
        const canvas = renderThumbnail(doc);
        // An empty board keeps its "nothing here yet" tile rather than being
        // given a picture of nothing.
        if (!canvas) return;

        const blob = await toPngBlob(canvas);
        if (!blob || cancelled) return;

        // The signature is good for an hour and capped at 60/hour/IP, so it is
        // minted once per session rather than once per save.
        signature.current ??= await signThumbnailUpload(boardId);
        const auth = signature.current;
        if (cancelled) return;

        const form = new FormData();
        form.append("file", blob);
        form.append("api_key", auth.apiKey);
        form.append("timestamp", String(auth.timestamp));
        form.append("signature", auth.signature);
        form.append("public_id", auth.publicId);
        // Signed exactly as sent: these must match the server's parameter set
        // or Cloudinary rejects the upload.
        form.append("overwrite", "true");
        form.append("invalidate", "true");

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${auth.cloudName}/image/upload`,
          { method: "POST", body: form },
        );
        if (!response.ok || cancelled) {
          // Most likely expired or rejected — get a fresh one next time.
          signature.current = null;
          return;
        }

        await setBoardThumbnail(boardId, auth.publicId);
      } catch {
        // Deliberately silent; see the note at the top.
        signature.current = null;
      } finally {
        inFlight = false;
      }
    };

    const schedule = () => {
      dirty = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, IDLE_MS);
    };

    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      // Only our own edits. Whoever is drawing uploads the picture of it; every
      // client racing to upload the same image would just burn the 60/hour
      // signature limit, and a pure spectator should never upload at all.
      if (origin !== LOCAL) return;
      schedule();
    };

    // Leaving is the moment a thumbnail is most worth having, and the last
    // chance to take one.
    const onHide = () => {
      if (document.visibilityState === "hidden" && dirty) void save();
    };

    doc.on("update", onUpdate);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      doc.off("update", onUpdate);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [doc, boardId]);
}
