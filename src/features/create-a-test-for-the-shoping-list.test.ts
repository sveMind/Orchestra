/**
 * Jest unit tests for `test/harness/setup.ts`.
 *
 * The test suite covers the two exported helpers:
 *   - `resetTestData()`
 *   - `startTestHarness()`
 *
 * All external side‑effects (Docker CLI and HTTP requests) are mocked so the
 * tests run fast, deterministically and without requiring a real Docker
 * environment or network service.
 */

import { jest } from '@jest/globals';

/* -------------------------------------------------------------------------
 *  Mock external dependencies
 * ------------------------------------------------------------------------ */
jest.mock('child_process', () => ({
  // `exec` is the function that `promisify` wraps inside the module.
  exec: jest.fn(),
}));

jest.mock('node-fetch', () => jest.fn());

/* -------------------------------------------------------------------------
 *  Import the module under test *after* the mocks are in place.
 * ------------------------------------------------------------------------ */
import { resetTestData, startTestHarness } from '../../test/harness/setup';
import fetch from 'node-fetch';
import { exec } from 'child_process';

const execMock = exec as jest.MockedFunction<typeof exec>;
const fetchMock = fetch as jest.MockedFunction<typeof fetch>;

const HEALTH_TIMEOUT_MS = 30_000; // same value as the source file
const POLL_INTERVAL_MS = 500; // same value as the source file

/* -------------------------------------------------------------------------
 *  Helpers
 * ------------------------------------------------------------------------ */
function mockExecSuccess() {
  // `exec` receives (cmd, options, callback)
  execMock.mockImplementation((_cmd, _opts, cb) => {
    cb(null, { stdout: 'mock stdout', stderr: '' });
  });
}
function mockExecFailure(message = 'docker error') {
  execMock.mockImplementation((_cmd, _opts, cb) => {
    cb(new Error(message), null as any);
  });
}

/* -------------------------------------------------------------------------
 *  Test suite
 * ------------------------------------------------------------------------ */
describe('test/harness/setup.ts', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  /* -----------------------------------------------------------------------
   * resetTestData()
   * --------------------------------------------------------------------- */
  describe('resetTestData', () => {
    it('resolves when the /reset endpoint returns 200', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as any);

      await expect(resetTestData()).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reset'),
        { method: 'POST' }
      );
    });

    it('rejects with a descriptive error when the response is not ok', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as any);

      await expect(resetTestData()).rejects.toThrow(
        /HTTP 500 Internal Server Error/
      );
    });

    it('rejects with a descriptive error when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('network failure'));

      await expect(resetTestData()).rejects.toThrow(
        /Failed to reset test data: network failure/
      );
    });
  });

  /* -----------------------------------------------------------------------
   * startTestHarness()
   * --------------------------------------------------------------------- */
  describe('startTestHarness', () => {
    it('starts containers, waits for health and returns a teardown function', async () => {
      // ---- docker‑compose up ------------------------------------------------
      mockExecSuccess();

      // ---- health check ----------------------------------------------------
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as any);

      // ---- docker‑compose down (called by teardown) ------------------------
      const execDownMock = execMock.mockImplementation((_cmd, _opts, cb) => {
        cb(null, { stdout: 'down stdout', stderr: '' });
      });

      const teardown = await startTestHarness();

      // The returned value must be a function that returns a Promise<void>
      expect(typeof teardown).toBe('function');

      // ---- invoke teardown --------------------------------------------------
      await teardown();

      // Verify that `docker compose down` was called exactly once
      expect(execDownMock).toHaveBeenCalledTimes(1);
      expect(execDownMock.mock.calls[0][0]).toContain('down');

      // Verify that the health‑check request was made exactly once
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/health')
      );
    });

    it('fails fast when docker compose up throws and does not call down', async () => {
      mockExecFailure('compose up failed');

      // health check should never be hit
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as any);

      await expect(startTestHarness()).rejects.toThrow('compose up failed');

      // No down command should be issued
      expect(execMock).toHaveBeenCalledTimes(1);
      expect(execMock.mock.calls[0][0]).toContain('up');
    });

    it('cleans up containers when health check times out', async () => {
      // ---- docker‑compose up succeeds ---------------------------------------
      mockExecSuccess();

      // ---- health check never succeeds --------------------------------------
      fetchMock.mockRejectedValue(new Error('connection refused'));

      // Use fake timers so we can fast‑forward through the 30 s timeout
      jest.useFakeTimers();

      const startPromise = startTestHarness();

      // Fast‑forward the timeout period + a little extra
      jest.advanceTimersByTime(HEALTH_TIMEOUT_MS + POLL_INTERVAL_MS);

      // Await the promise after the timer has been advanced
      await expect(startPromise).rejects.toThrow(
        /API health check timed out/
      );

      // Docker down must have been called exactly once for cleanup
      expect(execMock).toHaveBeenCalledTimes(2);
      // first call = up, second call = down
      expect(execMock.mock.calls[0][0]).toContain('up');
      expect(execMock.mock.calls[1][0]).toContain('down');
    });
  });
});