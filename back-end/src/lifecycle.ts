// Graceful shutdown.
//
// This matters more here than in a typical API: a board's live canvas is a Y.Doc
// held in memory, and unsaved edits exist nowhere else until the snapshot writer
// flushes them. A hard SIGKILL loses real user work, so SIGTERM has to drain
// before the process exits. docker-compose sets stop_grace_period to match.
//
// Hooks register themselves rather than being imported here, so this module
// stays free of dependencies on the subsystems it drains.

type ShutdownHook = {
  name: string;
  run: () => Promise<void> | void;
};

const hooks: ShutdownHook[] = [];
let shuttingDown = false;

/**
 * Register work to run on shutdown. Hooks run in registration order, so
 * register producers before the connections they depend on: flushing docs to
 * Postgres has to happen before Prisma disconnects.
 */
export function onShutdown(name: string, run: ShutdownHook["run"]): void {
  hooks.push({ name, run });
}

/**
 * Run every hook, then exit. A hook that hangs or throws must not strand the
 * process, so each is bounded individually and failures are logged rather than
 * rethrown — one broken hook should not skip the rest.
 */
export async function shutdown(signal: string, timeoutMs = 20_000): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[skrivle] ${signal} received — draining ${hooks.length} hooks`);

  // A last-resort exit in case a hook ignores its own timeout entirely.
  const hardExit = setTimeout(() => {
    console.error("[skrivle] shutdown exceeded its budget — exiting now");
    process.exit(1);
  }, timeoutMs);
  hardExit.unref();

  for (const hook of hooks) {
    try {
      await withTimeout(hook.run(), timeoutMs / Math.max(1, hooks.length), hook.name);
      console.log(`[skrivle]   ✓ ${hook.name}`);
    } catch (err) {
      console.error(`[skrivle]   ✗ ${hook.name}:`, err instanceof Error ? err.message : err);
    }
  }

  clearTimeout(hardExit);
  console.log("[skrivle] shutdown complete");
  process.exit(0);
}

async function withTimeout(
  work: Promise<void> | void,
  ms: number,
  label: string,
): Promise<void> {
  if (!(work instanceof Promise)) return;
  let timer: NodeJS.Timeout;
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    await Promise.race([work, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Wire the process signals. Call once, from the entrypoint. */
export function installSignalHandlers(): void {
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Without these, an async throw anywhere kills the process instantly and
  // takes every unflushed board with it.
  process.on("unhandledRejection", (reason) => {
    console.error("[skrivle] unhandled rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[skrivle] uncaught exception:", err);
    void shutdown("uncaughtException");
  });
}
