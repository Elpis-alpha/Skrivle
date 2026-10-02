// The update log — what a board has accepted since its last snapshot.
//
// A snapshot is written every 30 seconds while a board is dirty, so on its own
// a crash costs up to 30 seconds of everyone's work. This closes that gap:
// every update the server accepts is also appended to a Redis list, and a board
// loads as its snapshot plus whatever its log still holds.
//
// Redis rather than Postgres because this is exactly the high-churn data the
// schema keeps out of Postgres: an append per edit, deleted within the minute.
// The compose stack runs Redis with appendonly on and a volume, which survives
// the API crashing or being redeployed. A power cut on the host can still lose
// the last second, since that is how often Redis syncs the file to disk.
//
// The log is trimmed by marker, not by count. Writing a snapshot appends a seal
// in the same tick the doc is encoded, so everything before the seal is in the
// blob and everything after it isn't; once the blob lands, the list is cut just
// past that seal. Counting entries instead would be wrong whenever an append
// had failed, and would then cut an update the blob doesn't hold.
import { reportError } from "../errors/report.js";
import { redis } from "../redis/client.js";
import { keys, TTL } from "../redis/keys.js";

/** List entries are strings: an update as base64, or a seal's id. */
const UPDATE = "u:";
const SEAL = "s:";

/** Cut the list just past a seal — and leave it alone if the seal isn't there. */
const TRIM_THROUGH = `
local at = redis.call('LPOS', KEYS[1], ARGV[1])
if at then
  redis.call('LTRIM', KEYS[1], at + 1, -1)
end
return 0
`;

const REPORT_EVERY_MS = 10_000;
let lastReported = 0;

/** A log that can't be written fails at the rate people draw; say so once in a while. */
function reportQuietly(context: string, err: unknown, boardId: string): void {
  const now = Date.now();
  if (now - lastReported < REPORT_EVERY_MS) return;
  lastReported = now;
  reportError(context, err, { boardId });
}

/**
 * How long any one of these may take. node-redis doesn't fail a command while
 * it is disconnected: it queues it and waits, for as long as that takes. Left
 * alone, a Redis outage would hang every snapshot behind its seal and every
 * join behind its read — with Postgres, which holds the boards, perfectly well.
 */
const COMMAND_TIMEOUT_MS = 2000;

class LogUnavailable extends Error {
  constructor(why: string) {
    super(`The update log is unavailable: ${why}.`);
    this.name = "LogUnavailable";
  }
}

/** Run one Redis command, or fail: at once if Redis isn't connected, soon if it stalls. */
function bounded<T>(command: () => Promise<T>): Promise<T> {
  if (!redis.isReady) return Promise.reject(new LogUnavailable("Redis is not connected"));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new LogUnavailable("Redis did not answer in time")),
      COMMAND_TIMEOUT_MS,
    );
    command().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Append an accepted update. Not awaited by the caller: the edit is already in
 * the doc and on its way to the room, and neither should wait on Redis.
 *
 * With Redis down the update isn't logged, and isn't queued to be: it stays
 * what it was before there was a log, covered by the next snapshot.
 */
export function appendUpdate(boardId: string, update: Uint8Array): void {
  bounded(() =>
    redis.rPush(keys.updateLog(boardId), UPDATE + Buffer.from(update).toString("base64")),
  ).catch((err: unknown) => reportQuietly("update-log-append", err, boardId));
}

/**
 * Everything logged for a board since its last snapshot, oldest first.
 *
 * Throws when the log can't be read. A board must not be served without it:
 * the next snapshot would trim the unread entries away, and with them work the
 * server had accepted.
 */
export async function readUpdates(boardId: string): Promise<Uint8Array[]> {
  const entries = await bounded(() => redis.lRange(keys.updateLog(boardId), 0, -1));
  return entries
    .filter((entry) => entry.startsWith(UPDATE))
    .map((entry) => new Uint8Array(Buffer.from(entry.slice(UPDATE.length), "base64")));
}

let sealCount = 0;

/**
 * Mark this moment in a board's log.
 *
 * Call it in the same tick the doc is encoded, with nothing awaited between:
 * Redis runs one connection's commands in the order they were issued, which is
 * what puts the seal exactly between the updates the blob holds and the ones
 * it doesn't.
 *
 * Resolves to the seal to pass to trimLog, or null if it couldn't be written,
 * in which case there is nothing to trim to and the next snapshot's seal covers
 * these entries as well. Never rejects, and never takes longer than the
 * command timeout.
 */
export function sealLog(boardId: string): Promise<string | null> {
  const key = keys.updateLog(boardId);
  const seal = `${SEAL}${Date.now().toString(36)}-${(sealCount++).toString(36)}`;
  const pushed = bounded(() => redis.rPush(key, seal)).then(
    () => seal,
    (err: unknown) => {
      reportQuietly("update-log-seal", err, boardId);
      return null;
    },
  );
  // A backstop, not the mechanism: a log is trimmed by snapshots and dropped
  // with its board. This is for the one that somehow escapes both.
  bounded(() => redis.expire(key, TTL.updateLog)).catch(() => {});
  return pushed;
}

/**
 * Drop everything up to and including a seal, once the snapshot it marks has
 * landed. Never throws: the snapshot is saved either way, and entries left
 * behind are only replayed into a doc that already has them.
 */
export async function trimLog(boardId: string, seal: string | null): Promise<void> {
  if (!seal) return;
  try {
    await bounded(() =>
      redis.eval(TRIM_THROUGH, { keys: [keys.updateLog(boardId)], arguments: [seal] }),
    );
  } catch (err) {
    reportQuietly("update-log-trim", err, boardId);
  }
}

/**
 * Forget the logs of boards that no longer exist — or, for an id about to be
 * used, of the board that had it before. Never throws.
 */
export async function dropLogs(boardIds: string[]): Promise<void> {
  if (boardIds.length === 0) return;
  try {
    await bounded(() => redis.del(boardIds.map((id) => keys.updateLog(id))));
  } catch (err) {
    reportQuietly("update-log-drop", err, boardIds[0]!);
  }
}
