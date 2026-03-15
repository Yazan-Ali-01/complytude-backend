import type { Queue } from '@lib/queue';

/**
 * Poll until all active/waiting/delayed jobs on the given queue are drained.
 * Useful in integration tests that enqueue async jobs and need to assert
 * post-processing state without introducing arbitrary sleeps.
 */
export async function waitForQueueIdle(
  queue: Queue,
  timeout = 10000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const counts = await queue.getJobCounts('active', 'waiting', 'delayed');
    if (counts.active === 0 && counts.waiting === 0 && counts.delayed === 0) {
      return;
    }
    await new Promise<void>((r) => setTimeout(r, 100));
  }
  throw new Error(
    `Queue "${queue.name}" not idle within ${timeout}ms. ` +
      `Check for stuck or failing jobs.`,
  );
}
