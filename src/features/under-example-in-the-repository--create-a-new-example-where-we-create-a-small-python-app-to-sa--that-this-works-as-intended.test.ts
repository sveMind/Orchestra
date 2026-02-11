/**
 * Jest test suite for the simple simulated‑annealing demo script.
 *
 * The script (`demo.py`) is a pure‑Python program that:
 *   • seeds the RNG deterministically,
 *   • runs `SimulatedAnnealing` on a quadratic objective,
 *   • prints the best solution found.
 *
 * These tests execute the script in a child process, capture its stdout,
 * and verify that the reported solution is close to the known optimum
 * (x = 3, f(x) = 0).  The deterministic seed guarantees repeatable output,
 * making the test reliable for CI.
 */

const { execFile } = require('child_process');
const path = require('path');

describe('Simulated‑Annealing demo script', () => {
  // Path to the Python script (adjust the filename if it differs)
  const scriptPath = path.join(__dirname, 'demo.py');

  /**
   * Helper that runs the script and resolves with the parsed numbers.
   */
  function runScript() {
    return new Promise((resolve, reject) => {
      execFile('python', [scriptPath], (err, stdout, stderr) => {
        if (err) {
          return reject(err);
        }

        // Expected output format:
        //   Best x: <float>, value: <float>
        const match = stdout.trim().match(
          /Best x:\s*([-+]?\d*\.?\d+),\s*value:\s*([-+]?\d*\.?\d+)/i
        );

        if (!match) {
          return reject(
            new Error(`Unexpected output format:\n${stdout}\n${stderr}`)
          );
        }

        const bestX = parseFloat(match[1]);
        const bestVal = parseFloat(match[2]);

        resolve({ bestX, bestVal });
      });
    });
  }

  test('executes without error and exits with code 0', async () => {
    await expect(runScript()).resolves.toMatchObject({
      bestX: expect.any(Number),
      bestVal: expect.any(Number),
    });
  });

  test('finds a solution close to the known optimum', async () => {
    const { bestX, bestVal } = await runScript();

    // The deterministic run should converge very close to the optimum.
    // Tolerances are intentionally generous to stay robust against
    // minor implementation changes while still catching regressions.
    expect(bestX).toBeCloseTo(3, 1); // within ~0.1 of 3
    expect(bestVal).toBeCloseTo(0, 1); // within ~0.1 of 0
  });

  test('output format matches the expected pattern', async () => {
    const { bestX, bestVal } = await runScript();

    // Simple sanity checks on the numeric values.
    expect(Number.isFinite(bestX)).toBe(true);
    expect(Number.isFinite(bestVal)).toBe(true);
  });
});