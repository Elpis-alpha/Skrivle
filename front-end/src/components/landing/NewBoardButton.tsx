"use client";

// The primary action on every marketing surface. Mints an id and routes to it.
// See src/lib/board-id.ts — generation moves server-side in Phase 1.

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, type ButtonSize } from "@/components/ui/Button";
import { generateBoardId } from "@/lib/board-id";

export function NewBoardButton({
  children,
  size = "md",
  className,
  onNavigate,
}: {
  children: ReactNode;
  size?: ButtonSize;
  className?: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  // Never cleared on purpose: /board sits outside the marketing group, so a
  // successful push unmounts this button. The spinner runs until it goes.
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="primary"
      size={size}
      className={className}
      loading={pending}
      onClick={() => {
        if (pending) return;
        setPending(true);
        onNavigate?.();
        router.push(`/board/${generateBoardId()}`);
      }}
    >
      {children}
    </Button>
  );
}
