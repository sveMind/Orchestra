/**
 * @file sa_demo.test.js
 * Jest test suite for the Python SA demo script.
 *
 * The script (examples/sa_demo/demo.py) runs a tiny simulated‑annealing
 * optimisation on a simple quadratic function.  When executed it prints
 * a line with the best point and its objective value followed by a
 * deterministic success message:
 *
 *   Best x: <value>, f(x): <value>
 *   SA workflow completed successfully
 *
 * These tests spawn the Python interpreter, capture stdout/stderr and
 * verify:
 *   1. The process exits cleanly (exit code 0).
 *   2. The success message is present.
 *   3. The reported best‑x and f(x) are numeric and close to the
 *      known optimum (x = 3.0, f(x) = 0.0) within a reasonable tolerance.
 *
 * The tests are written to be deterministic and robust:
 *   • `spawnSync` is used so the test runner waits for the script to finish.
 *   • All output is decoded as UTF‑8 strings.
 *   • Regular‑expression parsing guards against malformed output.
 *   • `toBeCloseTo` is used with a small tolerance (2 decimal places)
 *     because the simulated‑annealing algorithm is stochastic but seeded.
 *
 * If the `sa` library cannot be imported the script writes an error to
 * stderr and exits with a non‑zero status – the first test will fail,
 * making the problem obvious.
 */

const { spawnSync } = require('child_process');
const path = require('path');

describe('SA demo script (examples/sa_demo/demo.py)', () => {
  // Holds the result of the Python execution for all tests.
  let execResult;

  // Run the script once before any test runs.
  beforeAll(() => {
    // Resolve the script path relative to this test file.
    const scriptPath = path.resolve(
      __dirname,
      '..',
      'examples',
      'sa_demo',
      'demo.py'
    );

    // Execute the script with the default Python interpreter.
    // `encoding: 'utf-8'` gives us string output instead of Buffers.
    execResult = spawnSync('python', [scriptPath], {
      encoding: 'utf-8',
    });
  });

  test('process exits with code 0 (no runtime errors)', () => {
    // `status` is the exit code; `null` means the process was terminated
    // by a signal, which we also treat as a failure.
    expect(execResult.status).toBe(0);
  });

  test('stdout contains the deterministic success message', () => {
    const { stdout } = execResult;
    expect(stdout).toContain('SA workflow completed successfully');
  });

  test('stdout contains a well‑formatted “Best x” line', () => {
    const { stdout } = execResult;
    const lines = stdout.trim().split('\n');
    const bestLine = lines.find((line) => line.startsWith('Best x:'));

    // The line must exist.
    expect(bestLine).toBeDefined();

    // Expected format: "Best x: <float>, f(x): <float>"
    const regex = /Best x:\s*([-+]?\d*\.?\d+),\s*f\(x\):\s*([-+]?\d*\.?\d+)/;
    const match = bestLine.match(regex);

    // The regex should capture exactly two numeric groups.
    expect(match).not.toBeNull();
    expect(match.length).toBe(3); // full match + two capture groups
  });

  test('reported best point is close to the known optimum', () => {
    const { stdout } = execResult;
    const lines = stdout.trim().split('\n');
    const bestLine = lines.find((line) => line.startsWith('Best x:'));
    const regex = /Best x:\s*([-+]?\d*\.?\d+),\s*f\(x\):\s*([-+]?\d*\.?\d+)/;
    const [, xStr, fStr] = bestLine.match(regex);

    const x = parseFloat(xStr);
    const f = parseFloat(fStr);

    // The optimizer is seeded, so we can expect a fairly accurate result.
    // `toBeCloseTo` uses a tolerance of 10⁻² when the second argument is 2.
    expect(x).toBeCloseTo(3.0, 2);
    expect(f).toBeCloseTo(0.0, 2);
  });
});