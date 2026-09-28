import { Logger } from '@nestjs/common';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  installProcessErrorHandlers,
  ProcessErrorHandlers,
} from './process-error-handlers';

type Listener = (...args: unknown[]) => void;

/** The listener installProcessErrorHandlers added for `event` (called directly: Jest owns emit). */
function addedListener(event: string, before: Listener[]): Listener {
  const added = (process.listeners(event as 'exit') as Listener[]).filter(
    (listener) => !before.includes(listener),
  );
  expect(added).toHaveLength(1);
  return added[0];
}

const flushPromises = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe('installProcessErrorHandlers', () => {
  let handlers: ProcessErrorHandlers | undefined;
  let fatalLines: string[];
  let beforeRejection: Listener[];
  let beforeException: Listener[];

  beforeEach(() => {
    fatalLines = [];
    jest
      .spyOn(Logger.prototype, 'fatal')
      .mockImplementation((message: unknown, stack?: unknown) => {
        fatalLines.push(`${String(message)}\n${String(stack)}`);
      });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'flush').mockImplementation(() => undefined);
    beforeRejection = process.listeners('unhandledRejection') as Listener[];
    beforeException = process.listeners('uncaughtException') as Listener[];
  });

  afterEach(() => {
    handlers?.uninstall();
    handlers = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('logs an unhandled rejection at fatal, runs the shutdown, then exits with 1', async () => {
    const order: string[] = [];
    const exit = jest.fn(() => order.push('exit'));
    handlers = installProcessErrorHandlers({ exit });
    handlers.setShutdown(() => {
      order.push('shutdown');
      return Promise.resolve();
    });

    addedListener('unhandledRejection', beforeRejection)(
      new Error('SES rejected the address'),
      Promise.resolve(),
    );
    await flushPromises();

    expect(fatalLines).toEqual([
      expect.stringMatching(
        /^unhandledRejection: SES rejected the address\nError: SES rejected the address/,
      ),
    ]);
    expect(order).toEqual(['shutdown', 'exit']);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('handles uncaught exceptions the same way', async () => {
    const exit = jest.fn();
    handlers = installProcessErrorHandlers({ exit });

    addedListener('uncaughtException', beforeException)(new Error('boom'));
    await flushPromises();

    expect(fatalLines[0]).toMatch(/^uncaughtException: boom/);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits even when the graceful shutdown hangs', async () => {
    jest.useFakeTimers();
    const exit = jest.fn();
    handlers = installProcessErrorHandlers({ exit, shutdownTimeoutMs: 5000 });
    handlers.setShutdown(() => new Promise(() => undefined));

    const done = handlers.fatal(new Error('stuck'), 'bootstrap');
    await jest.advanceTimersByTimeAsync(4999);
    expect(exit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await done;

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits even when the graceful shutdown throws', async () => {
    const exit = jest.fn();
    handlers = installProcessErrorHandlers({ exit });
    handlers.setShutdown(() => Promise.reject(new Error('close failed')));

    await handlers.fatal('not an Error', 'unhandledRejection');

    expect(fatalLines[0]).toMatch(/^unhandledRejection: not an Error/);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits immediately on a second fatal error during shutdown', async () => {
    const exit = jest.fn();
    handlers = installProcessErrorHandlers({ exit });
    let finishShutdown: () => void = () => undefined;
    handlers.setShutdown(
      () => new Promise<void>((resolve) => (finishShutdown = resolve)),
    );

    const first = handlers.fatal(new Error('first'), 'unhandledRejection');
    await handlers.fatal(new Error('second'), 'unhandledRejection');
    expect(exit).toHaveBeenCalledTimes(1);

    finishShutdown();
    await first;
    expect(exit).toHaveBeenCalledTimes(2);
  });

  it('removes its listeners on uninstall', () => {
    handlers = installProcessErrorHandlers({ exit: jest.fn() });
    handlers.uninstall();

    expect(process.listeners('unhandledRejection')).toEqual(beforeRejection);
    expect(process.listeners('uncaughtException')).toEqual(beforeException);
  });

  it('turns an unhandled rejection in a real process into a fatal log and exit code 1', () => {
    const script = [
      `const { installProcessErrorHandlers } = require(${JSON.stringify(join(__dirname, 'process-error-handlers.ts'))});`,
      'installProcessErrorHandlers();',
      "Promise.reject(new Error('boom-from-child'));",
      "setTimeout(() => console.log('still-alive'), 3000);",
    ].join('\n');

    const child = spawnSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-e', script],
      { encoding: 'utf8', timeout: 30000 },
    );
    const output = `${child.stdout}${child.stderr}`;

    expect(child.status).toBe(1);
    expect(output).toMatch(/FATAL.*unhandledRejection: boom-from-child/);
    expect(output).not.toContain('still-alive');
  });
});
