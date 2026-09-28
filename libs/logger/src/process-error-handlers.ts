import { Logger } from '@nestjs/common';

export interface ProcessErrorHandlerOptions {
  /** How long the graceful shutdown may take before the process exits anyway. */
  shutdownTimeoutMs?: number;
  /** Process exit; injectable for tests. */
  exit?: (code: number) => void;
}

export interface ProcessErrorHandlers {
  /** Registers the graceful shutdown to attempt before exiting (usually `() => app.close()`). */
  setShutdown(shutdown: () => Promise<unknown>): void;
  /** Logs the error at fatal, attempts the shutdown, then exits with code 1. */
  fatal(error: unknown, origin: string): Promise<void>;
  /** Removes the process listeners (tests). */
  uninstall(): void;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Last-resort handling for errors nothing else caught (unhandled rejections, uncaught exceptions,
 * a failed bootstrap). The process is in an unknown state, so it logs at fatal and exits with
 * code 1 for the orchestrator (ECS) to replace it, instead of dying without a structured log.
 */
export function installProcessErrorHandlers(
  options: ProcessErrorHandlerOptions = {},
): ProcessErrorHandlers {
  const logger = new Logger('Process');
  const timeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const exit = options.exit ?? ((code: number): void => process.exit(code));
  let shutdown: (() => Promise<unknown>) | undefined;
  let exiting = false;

  const fatal = async (error: unknown, origin: string): Promise<void> => {
    // Boot logs may still be buffered (bufferLogs); print them before the fatal line.
    Logger.flush();
    logger.fatal(
      `${origin}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );

    if (exiting) {
      exit(1);
      return;
    }
    exiting = true;

    if (shutdown) {
      let timer: NodeJS.Timeout | undefined;
      // Not unref'd: if the shutdown hangs, this timer keeps the process alive until exit(1),
      // so it can't drain to a natural exit with code 0.
      const timedOut = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      });
      try {
        const outcome = await Promise.race([shutdown(), timedOut]);
        if (outcome === 'timeout') {
          logger.error(
            `Graceful shutdown did not finish within ${timeoutMs}ms`,
          );
        }
      } catch (shutdownError: unknown) {
        logger.error(
          `Graceful shutdown failed: ${shutdownError instanceof Error ? shutdownError.message : String(shutdownError)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    }
    exit(1);
  };

  const onUnhandledRejection = (reason: unknown): void => {
    fatal(reason, 'unhandledRejection').catch(() => exit(1));
  };
  const onUncaughtException = (error: Error): void => {
    fatal(error, 'uncaughtException').catch(() => exit(1));
  };

  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);

  return {
    setShutdown: (fn) => {
      shutdown = fn;
    },
    fatal,
    uninstall: () => {
      process.off('unhandledRejection', onUnhandledRejection);
      process.off('uncaughtException', onUncaughtException);
    },
  };
}
