import type { Lifecycle } from "./lifecycle.ts";
import logger from "./logger.ts";

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
const DUPLICATE_SIGNAL_WINDOW_MS = 500;
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

export type BootOptions = {
  lifecycles: readonly Lifecycle[];
  shutdownTimeoutMs?: number;
};

export async function boot(options: BootOptions): Promise<void> {
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const started: Lifecycle[] = [];
  const pending = new Set<string>();
  let shuttingDown = false;
  let lastSignalAt = 0;
  let startupFailed = false;
  let startupPromise: Promise<void> | undefined;

  const logForcedExit = (reason: string) => {
    if (pending.size === 0) {
      logger.error({ reason }, "Forced exit");
      return;
    }

    logger.error({ lifecycles: [...pending], reason }, "Forced exit");
  };

  const stopAll = async () => {
    const lifecycles = [...started].reverse();
    for (const lifecycle of lifecycles) {
      if (!lifecycle.stop) {
        pending.delete(lifecycle.name);
        logger.info({ lifecycle: lifecycle.name }, "Stopped");
        continue;
      }

      try {
        // biome-ignore lint/performance/noAwaitInLoops: lifecycles must stop in reverse start order
        await lifecycle.stop();
        pending.delete(lifecycle.name);
        logger.info({ lifecycle: lifecycle.name }, "Stopped");
      } catch (error) {
        pending.delete(lifecycle.name);
        logger.error({ err: error, lifecycle: lifecycle.name }, "Failed to stop");
      }
    }
  };

  const shutdown = async (reason: string, exitCode: number) => {
    const now = Date.now();
    if (shuttingDown) {
      if (now - lastSignalAt < DUPLICATE_SIGNAL_WINDOW_MS) {
        return;
      }
      logForcedExit(reason);
      process.exit(1);
    }

    lastSignalAt = now;
    shuttingDown = true;
    logger.info({ reason }, "Exiting");

    const forceTimer = setTimeout(() => {
      logger.error({ shutdownTimeoutMs }, "Shutdown timed out");
      logForcedExit("timeout");
      process.exit(1);
    }, shutdownTimeoutMs);
    forceTimer.unref();

    await startupPromise;
    await stopAll();
    clearTimeout(forceTimer);
    logger.info("Exited");
    process.exit(startupFailed ? 1 : exitCode);
  };

  const onSignal = (signal: string) => {
    void shutdown(signal, 0);
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => onSignal(signal));
  }

  process.on("uncaughtException", (error) => {
    logger.error({ err: error }, "Uncaught exception");
    void shutdown("uncaughtException", 1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled rejection");
    void shutdown("unhandledRejection", 1);
  });

  startupPromise = (async () => {
    try {
      for (const lifecycle of options.lifecycles) {
        if (shuttingDown) {
          break;
        }

        // biome-ignore lint/performance/noAwaitInLoops: lifecycles must start in registration order
        await lifecycle.start?.();
        started.push(lifecycle);
        pending.add(lifecycle.name);
        logger.info({ lifecycle: lifecycle.name }, "Started");
      }
    } catch (error) {
      startupFailed = true;
      logger.error({ err: error }, "Startup failed");
    }
  })();

  await startupPromise;

  if (startupFailed && !shuttingDown) {
    await stopAll();
    process.exit(1);
  }
}
