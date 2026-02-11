/**
 * Jest integration tests for the Python demo script `app.py`.
 *
 * The tests create a temporary mock `service_account` package that the
 * script imports. Two scenarios are covered:
 *
 *  1. Successful account creation – the mock client returns an object
 *     with an `id` attribute. The script should exit with status 0 and
 *     print the success messages.
 *
 *  2. Failure during account creation – the mock client throws an
 *     exception. The script should exit with a non‑zero status (1) and
 *     write an error message to stderr.
 *
 * The tests use Node’s `child_process.spawnSync` to execute the Python
 * script in a controlled environment (PYTHONPATH points to the temporary
 * mock package). After each test the temporary directory is removed.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Helper: creates a temporary directory, writes a minimal mock
 * `service_account` package and copies the `app.py` script into it.
 *
 * @param {Object} options
 * @param {boolean} options.shouldThrow – if true, the mock client
 *                                          will throw when `create_account`
 *                                          is called.
 * @returns {string} absolute path to the temporary directory.
 */
function setupTempProject({ shouldThrow = false } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-test-'));

  // ---- mock package: service_account/__init__.py ----
  const pkgDir = path.join(tmpDir, 'service_account');
  fs.mkdirSync(pkgDir);
  const initPath = path.join(pkgDir, '__init__.py');

  // Minimal ServiceAccount class with an `id` attribute.
  const serviceAccountClass = `
class ServiceAccount:
    def __init__(self, id):
        self.id = id
`;

  // Mock ServiceAccountClient.
  // If `shouldThrow` is true, `create_account` raises an exception.
  const clientClass = shouldThrow
    ? `
class ServiceAccountClient:
    def __init__(self, *args, **kwargs):
        pass

    def create_account(self, name):
        raise RuntimeError("mocked failure")
`
    : `
class ServiceAccountClient:
    def __init__(self, *args, **kwargs):
        pass

    def create_account(self, name):
        # Return a ServiceAccount with a deterministic id for testing.
        return ServiceAccount(id="mock-id-123")
`;

  fs.writeFileSync(initPath, serviceAccountClass + clientClass);

  // ---- copy the demo script (app.py) into the temp dir ----
  const srcScript = path.resolve(__dirname, 'app.py'); // adjust if script lives elsewhere
  const dstScript = path.join(tmpDir, 'app.py');
  fs.copyFileSync(srcScript, dstScript);

  return tmpDir;
}

/**
 * Executes the demo script inside a given directory.
 *
 * @param {string} cwd – working directory (the temp project root).
 * @returns {Object} result of `spawnSync`.
 */
function runDemo(cwd) {
  // Ensure the Python interpreter can find the mock package.
  const env = { ...process.env, PYTHONPATH: cwd };

  // Run the script with the same Python executable that runs the tests.
  // Using `python` (or `python3`) works on most CI environments.
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  return spawnSync(pythonCmd, ['app.py'], {
    cwd,
    env,
    encoding: 'utf8',
  });
}

/**
 * Clean‑up helper – removes the temporary directory recursively.
 *
 * @param {string} dirPath
 */
function cleanup(dirPath) {
  // Node 12+ supports recursive removal.
  fs.rmSync(dirPath, { recursive: true, force: true });
}

// ---------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------

describe('Demo script (app.py) integration tests', () => {
  afterAll(() => {
    // In case any stray temp dirs remain (should not happen).
    // No action needed – each test cleans its own dir.
  });

  test('successful account creation exits with 0 and prints success messages', () => {
    const tmpDir = setupTempProject({ shouldThrow: false });

    try {
      const result = runDemo(tmpDir);

      // ---- assertions ----
      expect(result.status).toBe(0); // exit code 0
      expect(result.error).toBeUndefined();

      // stdout should contain both success lines.
      const stdout = result.stdout.trim().split('\n');
      expect(stdout).toHaveLength(2);
      expect(stdout[0]).toMatch(/^✅ Service Account created successfully – ID: mock-id-123$/);
      expect(stdout[1]).toBe('✅ Demo completed successfully.');

      // stderr should be empty.
      expect(result.stderr).toBe('');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('failure during account creation exits with 1 and prints error to stderr', () => {
    const tmpDir = setupTempProject({ shouldThrow: true });

    try {
      const result = runDemo(tmpDir);

      // ---- assertions ----
      // The script returns a non‑zero status (1) on error.
      expect(result.status).toBe(1);
      // spawnSync may set `status` to null and `signal` if the process was killed,
      // but here we expect a normal exit.
      expect(result.error).toBeUndefined();

      // stdout should be empty (script prints only to stderr on error).
      expect(result.stdout.trim()).toBe('');

      // stderr should contain the custom error line and a traceback.
      const stderrLines = result.stderr.trim().split('\n');
      // The first line is our custom message.
      expect(stderrLines[0]).toBe('❌ An error occurred while running the demo:');
      // The rest should include a Python traceback and our mocked error.
      const containsTraceback = stderrLines.slice(1).some(line => line.includes('RuntimeError: mocked failure'));
      expect(containsTraceback).toBe(true);
    } finally {
      cleanup(tmpDir);
    }
  });
});