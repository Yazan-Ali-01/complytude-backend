import type { WorkerHost } from '@nestjs/bullmq';

export interface WorkerHealth {
  status: 'ok' | 'unhealthy';
  running: boolean;
  redis: boolean;
}

/**
 * Whether a worker can do its job: its BullMQ worker is running and its Redis connection answers.
 * A worker whose connection died is reported unhealthy, so the orchestrator replaces it instead
 * of leaving a task that looks alive but processes nothing.
 */
export async function checkWorkerHealth(
  processor: WorkerHost,
  timeoutMs = 2000,
): Promise<WorkerHealth> {
  const worker = processor.worker;
  const running = worker?.isRunning() ?? false;
  let redis = false;
  try {
    const client = await worker.client;
    redis =
      (await Promise.race([
        client.ping(),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve(''), timeoutMs),
        ),
      ])) === 'PONG';
  } catch {
    redis = false;
  }
  return { status: running && redis ? 'ok' : 'unhealthy', running, redis };
}
