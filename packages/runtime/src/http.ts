export type CloseableServer = {
  close: (callback?: (error?: Error) => void) => void;
  closeAllConnections?: () => void;
  closeIdleConnections?: () => void;
};

const DEFAULT_FORCE_CLOSE_MS = 8000;

export function shutdownServer(server: CloseableServer, options?: { forceAfterMs?: number }): Promise<void> {
  const forceAfterMs = options?.forceAfterMs ?? DEFAULT_FORCE_CLOSE_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (forceTimer) {
        clearTimeout(forceTimer);
      }
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    try {
      server.close((error) => {
        finish(error);
      });

      if (settled) {
        return;
      }

      server.closeIdleConnections?.();
      forceTimer = setTimeout(() => {
        try {
          server.closeAllConnections?.();
          finish(new Error(`Server did not close within ${forceAfterMs}ms`));
        } catch (error) {
          finish(error instanceof Error ? error : new Error("Failed to force-close server", { cause: error }));
        }
      }, forceAfterMs);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Failed to close server", { cause: error }));
    }
  });
}
