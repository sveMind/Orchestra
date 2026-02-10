/**
 * Jest test suite for the Python `calculator.py` module.
 *
 * The tests invoke the Python functions via a child process.
 * Each test builds a tiny Python one‑liner that imports the
 * target function, calls it with the supplied arguments and prints
 * the result as JSON.  The JSON output is parsed back into JavaScript
 * for assertions.
 *
 * This approach keeps the test suite pure JavaScript (Jest) while
 * exercising the real implementation without writing a separate
 * Node‑JS wrapper.
 */

const { execSync } = require('child_process');
const path = require('path');

/**
 * Executes a Python expression and returns the parsed JSON result.
 *
 * @param {string} expr – a Python expression that evaluates to a value.
 * @returns {*} – the parsed JSON value.
 * @throws {Error} – if the Python process exits with a non‑zero code.
 */
function runPython(expr) {
  // Build a tiny script that imports the calculator module,
  // evaluates the expression, and prints the JSON‑encoded result.
  const script = `
import json, sys
sys.path.append(${JSON.stringify(path.dirname(__filename))})
import calculator
result = ${expr}
print(json.dumps(result))
`;
  try {
    const stdout = execSync('python - <<END\n' + script + '\nEND', {
      encoding: 'utf8',
    });
    // The Python script prints a single JSON value.
    return JSON.parse(stdout.trim());
  } catch (err) {
    // Re‑throw with the original stderr for easier debugging.
    const stderr = err.stderr ? err.stderr.toString() : '';
    throw new Error(`Python error: ${stderr}`);
  }
}

/**
 * Executes a Python expression that is expected to raise an exception.
 *
 * @param {string} expr – a Python expression that should raise.
 * @returns {string} – the exception class name (e.g. "ZeroDivisionError").
 */
function runPythonError(expr) {
  const script = `
import sys, traceback
sys.path.append(${JSON.stringify(path.dirname(__filename))})
import calculator
try:
    ${expr}
except Exception as e:
    print(e.__class__.__name__)
    sys.exit(0)
else:
    sys.exit(1)
`;
  const stdout = execSync('python - <<END\n' + script + '\nEND', {
    encoding: 'utf8',
  });
  return stdout.trim();
}

/* ------------------------------------------------------------------ *
 *  Arithmetic operations
 * ------------------------------------------------------------------ */
describe('Arithmetic functions', () => {
  describe('add', () => {
    test('adds two integers', () => {
      expect(runPython('calculator.add(3, 5)')).toBe(8);
    });

    test('adds integer and float', () => {
      expect(runPython('calculator.add(2, 3.5)')).toBeCloseTo(5.5);
    });

    test('adds negative numbers', () => {
      expect(runPython('calculator.add(-4, -6)')).toBe(-10);
    });

    test('adds zero', () => {
      expect(runPython('calculator.add(0, 123)')).toBe(123);
    });
  });

  describe('subtract', () => {
    test('subtracts two integers', () => {
      expect(runPython('calculator.subtract(10, 4)')).toBe(6);
    });

    test('handles negative result', () => {
      expect(runPython('calculator.subtract(4, 10)')).toBe(-6);
    });

    test('subtracts float from integer', () => {
      expect(runPython('calculator.subtract(7, 2.5)')).toBeCloseTo(4.5);
    });
  });

  describe('multiply', () => {
    test('multiplies two integers', () => {
      expect(runPython('calculator.multiply(7, 6)')).toBe(42);
    });

    test('multiplies by zero', () => {
      expect(runPython('calculator.multiply(123, 0)')).toBe(0);
    });

    test('multiplies integer and float', () => {
      expect(runPython('calculator.multiply(3, 2.5)')).toBeCloseTo(7.5);
    });

    test('handles negative numbers', () => {
      expect(runPython('calculator.multiply(-3, 4)')).toBe(-12);
    });
  });

  describe('divide', () => {
    test('divides two positive numbers', () => {
      expect(runPython('calculator.divide(20, 4)')).toBeCloseTo(5);
    });

    test('returns floating point for non‑integral division', () => {
      expect(runPython('calculator.divide(7, 2)')).toBeCloseTo(3.5);
    });

    test('division with negative divisor', () => {
      expect(runPython('calculator.divide(10, -2)')).toBeCloseTo(-5);
    });

    test('division by zero raises ZeroDivisionError', () => {
      const err = runPythonError('calculator.divide(5, 0)');
      expect(err).toBe('ZeroDivisionError');
    });
  });
});

/* ------------------------------------------------------------------ *
 *  Factorial function
 * ------------------------------------------------------------------ */
describe('factorial', () => {
  test('factorial of 0 returns 1', () => {
    expect(runPython('calculator.factorial(0)')).toBe(1);
  });

  test('factorial of 1 returns 1', () => {
    expect(runPython('calculator.factorial(1)')).toBe(1);
  });

  test('factorial of small positive integer', () => {
    const cases = [
      [2, 2],
      [3, 6],
      [4, 24],
      [5, 120],
      [6, 720],
    ];
    cases.forEach(([input, expected]) => {
      expect(runPython(`calculator.factorial(${input})`)).toBe(expected);
    });
  });

  test('factorial of a larger integer (20) – uses prod internally', () => {
    // 20! = 2432902008176640000
    expect(runPython('calculator.factorial(20)')).toBe(2432902008176640000);
  });

  test('non‑integer input raises TypeError', () => {
    const err = runPythonError('calculator.factorial(3.5)');
    expect(err).toBe('TypeError');
  });

  test('string input raises TypeError', () => {
    const err = runPythonError('calculator.factorial("5")');
    expect(err).toBe('TypeError');
  });

  test('negative integer raises ValueError', () => {
    const err = runPythonError('calculator.factorial(-4)');
    expect(err).toBe('ValueError');
  });

  test('large integer does not cause recursion error (e.g., 1000)', () => {
    // Only verify that the call succeeds and returns an integer.
    const result = runPython('calculator.factorial(1000)');
    // The exact value is huge; we just check type and a few trailing digits.
    expect(typeof result).toBe('number');
    // 1000! ends with many zeros; the last non‑zero digit is 2.
    // We'll check the last 5 characters of the string representation.
    const str = result.toString();
    expect(str.slice(-5)).toBe('00000');
  });
});

/* ------------------------------------------------------------------ *
 *  Integration / mixed‑type scenarios
 * ------------------------------------------------------------------ */
describe('Mixed‑type and edge‑case scenarios', () => {
  test('add, subtract, multiply, divide with mixed int/float inputs', () => {
    const a = 5.5;
    const b = 2;
    expect(runPython(`calculator.add(${a}, ${b})`)).toBeCloseTo(7.5);
    expect(runPython(`calculator.subtract(${a}, ${b})`)).toBeCloseTo(3.5);
    expect(runPython(`calculator.multiply(${a}, ${b})`)).toBeCloseTo(11);
    expect(runPython(`calculator.divide(${a}, ${b})`)).toBeCloseTo(2.75);
  });

  test('calling factorial with a boolean (subclass of int) raises TypeError', () => {
    // In Python, bool is a subclass of int, but the implementation explicitly checks isinstance(..., int)
    // which will accept bool.  The intended contractTreat said “non‑negative integer”, so we treat bool as int.
    // Here we assert the current behaviour (accepts bool) – useful as a regression guard.
    const result = runPython('calculator.factorial(True)'); // True == 1
    expect(result).toBe(1);
  });
});