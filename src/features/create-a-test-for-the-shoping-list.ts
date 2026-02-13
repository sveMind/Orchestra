/**
 * test/harness/setup.ts
 *
 * This module is responsible for starting and stopping the isolated test
 * environment used by the Shopping‑List end‑to‑end suite. It relies on a
 * Docker‑Compose configuration (docker‑compose.yml) that brings up the
 * UI server, API server and an in‑memory data store.
 *
 * The public API consists of two async helpers:
 *
 *   - `startTestHarness()` – brings up the containers, waits for the API
 *     health‑check to succeed and returns a cleanup function.
 *
 *   - `resetTestData()` – clears the mock database between individual tests
 *     (via a dedicated `/reset` endpoint exposed by the mock API).
 *
 * The implementation is deliberately lightweight, language‑agnostic and can be
 * used with any test runner (Playwright, Cypress, Jest, etc.).
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import * as path from 'path';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Path to the docker‑compose file. It is resolved relative to the repository
 * root so that the script works regardless of the current working directory.
 */
const COMPOSE_FILE = path.resolve(__dirname, '../../docker-compose.yml');

/**
 * The base URL of the mock API service. Adjust if the compose file changes.
 * The value is normalised to avoid a trailing slash that could cause a
 * double‑slash in request URLs.
 */
const API_BASE_URL = (process.env.SHOPPING_API_URL ?? 'http://localhost:4000').replace(
  /\/+$/,
  ''
);

/**
 * Timeout (ms) for waiting for the API health‑check to become available.
 */
const HEALTH_TIMEOUT_MS = 30_000;

/**
 * Interval (ms) between health‑check attempts.
 */
const HEALTH_POLL_INTERVAL_MS = 500;

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Executes `docker compose -f <file> up -d` and returns the raw stdout.
 * A larger `maxBuffer` is used to avoid failures when Docker emits
 * verbose logs.
 */
async function dockerComposeUp(): Promise<string> {
  const cmd = `docker compose -f "${COMPOSE_FILE}" up -d`;
  const { stdout, stderr } = await execAsync(cmd, {
    maxBuffer: 10 * 1024 * 1024, // 10 MiB
  });
  if (stderr) {
    console.warn('docker compose up produced stderr:', stderr);
  }
  return stdout;
}

/**
 * Executes `docker compose -f <file> down --volumes --remove-orphans`.
 */
async function dockerComposeDown(): Promise<string> {
  const cmd = `docker compose -f "${COMPOSE_FILE}" down --volumes --remove-orphans`;
  const { stdout, stderr } = await execAsync(cmd, {
    maxBuffer: 10 * 1024 * 1024, // 10 MiB
  });
  if (stderr) {
    console.warn('docker compose down produced stderr:', stderr);
  }
  return stdout;
}

/**
 * Polls the `/health` endpoint until it returns a 200 status or the timeout
 * expires.
 */
async function waitForApiHealth(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // ignore connection errors – the service is probably not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  throw new Error(
    `API health check timed out after ${HEALTH_TIMEOUT_MS}ms (URL: ${API_BASE_URL}/health)`
  );
}

/**
 * Calls the mock API's `/reset` endpoint to clear all persisted items.
 * Network‑level failures are caught and re‑thrown with a descriptive message.
 */
export async function resetTestData(): Promise<void> {
  const resetUrl = `${API_BASE_URL}/reset`;
  try {
    const res = await fetch(resetUrl, { method: 'POST' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
  } catch (err: any) {
    throw new Error(`Failed to reset test data: ${err.message ?? err}`);
  }
}

/**
 * Returns a function that kills the Docker containers started by this harness.
 * It is useful when the test runner wants explicit control over teardown.
 */
export async function startTestHarness(): Promise<() => Promise<void>> {
  console.info('🚀 Starting Shopping‑List test harness...');
  let containersStarted = false;
  try {
    await dockerComposeUp();
    containersStarted = true;
    console.info('⏳ Waiting for API health‑check...');
    await waitForApiHealth();
    console.info('✅ Test harness is ready.');
  } catch (err) {
    console.error('❌ Test harness setup failed:', err);
    // Ensure we clean up any containers that may have been started.
    if (containersStarted) {
      try {
        await dockerComposeDown();
      } catch (downErr) {
        console.error('⚠️ Failed to clean up containers after setup error:', downErr);
      }
    }
    throw err;
  }

  // Return a cleanup function that the caller can invoke (e.g. in afterAll)
  const teardown = async () => {
    console.info('🛑 Tearing down Shopping‑List test harness...');
    await dockerComposeDown();
    console.info('🧹 Cleanup complete.');
  };

  return teardown;
}

/**
 * Optional: automatically start the harness when the module is imported.
 * This is convenient for test runners that do not provide a global setup hook.
 *
 * If you prefer explicit control, comment out the following block and call
 * `await startTestHarness()` from your test framework's globalSetup.
 */
if (require.main === module) {
  // When executed directly (`node test/harness/setup.ts`) we start the harness
  // and keep the process alive until it receives SIGINT/SIGTERM.
  (async () => {
    const teardown = await startTestHarness();

    const gracefulExit = async () => {
      await teardown();
      process.exit(0);
    };

    process.on('SIGINT', gracefulExit);
    process.on('SIGTERM', gracefulExit);

    // Keep the process alive indefinitely; it will exit on a signal.
    await new Promise(() => {
      // never resolves
    });
  })().catch((err) => {
    console.error('❌ Failed to start test harness:', err);
    process.exit(1);
  });
}