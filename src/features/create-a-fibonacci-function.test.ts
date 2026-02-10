/**
 * Jest test suite for the Python implementation in `src/fib/_core.py`.
 *
 * The tests invoke the Python interpreter via `child_process.execSync`
 * and communicate using JSON.  This approach keeps the test suite
 * completely in JavaScript while still exercising the real Python code.
 *
 * The test coverage focuses on:
 *   • Correct values for a variety of small indices.
 *   • Proper handling of the maximum allowed index (`MAX_N`).
 *   • Validation of input types and bounds for both `fib` and `fib_list`.
 *   • Consistency between `fib` and `fib_list`.
 */

const { execSync } = require('child_process');
const path = require('path');

/**
 * Execute a short Python snippet and return the parsed JSON output.
 *
 * @param {string} snippet – Python code that must `print(json.dumps(...))`.
 * @returns {any} Parsed JSON value.
 */
function runPython(snippet) {
  // The Python process is started with `-c` (run command) to avoid file I/O.
  // We prepend the repository root `src` directory to `sys.path` so that
  // `import fib._core` works regardless of the current working directory.
  const command = [
    `python -c "`,
    `import json, sys;`,
    `sys.path.append(${JSON.stringify(path.resolve('src'))});`,
    `try:`,
    `    ${snippet}`,
    `except Exception as e:`,
    `    print(json.dumps({\"error\": str(e)}))`,
    `"`,
  ].join('\n');

  const raw = execSync(command, { encoding: 'utf8' }).trim();
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed.error === 'string') {
    // Re‑throw as a JavaScript error to make test failures clearer.
    throw new Error(`Python error: ${parsed.error}`);
  }
  return parsed;
}

/**
 * Helper that calls `fib` from the Python module.
 *
 * @param {number|bigint} n – Index to compute.
 * @returns {number|string} Fibonacci number (as number for small n, string for huge n).
 */
function fib(n) {
  // For very large results we ask Python to return a string to avoid
  // JavaScript number overflow.
  const asString = typeof n === 'bigint' || n > 100_000;
  const snippet = [
    `from fib._core import fib`,
    `result = fib(${n})`,
    `print(json.dumps({ "result": str(result) if ${asString} else result }))`,
  ].join('\n');
  const out = runPython(snippet);
  return out.result;
}

/**
 * Helper that calls `fib_list` from the Python module.
 *
 * @param {number} k – Length of the list.
 * @returns {number[]} Array of Fibonacci numbers (all small enough to fit in JS).
 */
function fibList(k) {
  const snippet = [
    `from fib._core import fib_list`,
    `result = fib_list(${k})`,
    `print(json.dumps({ "result": result }))`,
  ].join('\n');
  const out = runPython(snippet);
  return out.result;
}

/* -------------------------------------------------------------------------- */
/*                       Test suite – basic correctness                       */
/* -------------------------------------------------------------------------- */

describe('fib (fast‑doubling) – correct values', () => {
  const known = [
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 3],
    [5, 5],
    [6, 8],
    [7, 13],
    [8, 21],
    [9, 34],
    [10, 55],
    [20, 6765],
    [30, 832040],
    [50, 12586269025],
  ];

  test.each(known)('fib(%i) = %s', (n, expected) => {
    expect(fib(n)).toBe(expected);
  });
});

/* -------------------------------------------------------------------------- */
/*                       Test suite – edge cases & limits                     */
/* -------------------------------------------------------------------------- */

describe('fib – edge cases & validation', () => {
  const MAX_N = 10 ** 6; // Must stay in sync with Python's constant.

  test('fib(0) returns 0', () => {
    expect(fib(0)).toBe(0);
  });

  test(`fib(MAX_N) does not raise and returns a string (too large for JS number)`, () => {
    const result = fib(MAX_N);
    // The result should be a string representation of a huge integer.
    expect(typeof result).toBe('string');
    // It must contain only digits and be non‑empty.
    expect(/^\d+$/.test(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test('negative index raises ValueError with correct message', () => {
    const snippet = [
      `from fib._core import fib`,
      `fib(-1)`,
    ].join('\n');
    expect(() => runPython(snippet)).toThrow(/Fibonacci index must be non‑negative/);
  });

  test('non‑integer (float) raises ValueError', () => {
    const snippet = [
      `from fib._core import fib`,
      `fib(3.14)`,
    ].join('\n');
    expect(() => runPython(snippet)).toThrow(/must be an integer/);
  });

  test('non‑integer (string) raises ValueError', () => {
    const snippet = [
      `from fib._core import fib`,
      `fib("10")`,
    ].join('\n');
    expect(() => runPython(snippet)).toThrow(/must be an integer/);
  });

  test('index larger than MAX_N raises ValueError', () => {
    const snippet = [
      `from fib._core import fib`,
      `fib(${MAX_N + 1})`,
    ].join('\n');
    expect(() => runPython(snippet)).toThrow(/too large/);
  });
});

/* -------------------------------------------------------------------------- */
/*                       Test suite – fib_list                                 */
/* -------------------------------------------------------------------------- */

describe('fib_list – correct sequences', () => {
  test('fib_list(0) returns empty array', () => {
    expect(fibList(0)).toEqual([]);
  });

  test('fib_list(1) returns [0]', () => {
    expect(fibList(1)).toEqual([0]);
  });

  test('fib_list(5) returns first five Fibonacci numbers', () => {
    expect(fibList(5)).toEqual([0, 1, 1, 2, 3]);
  });

  test('fib_list(10) matches iterative generation', () => {
    const expected = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34];
    expect(fibList(10)).toEqual(expected);
  });
});

describe('fib_list – edge cases & validation', () => {
  const MAX_N = 10 ** 6;

  test('negative length raises ValueError', () => {
    const snippet = [
      `from fib._core import fib_list`,
      `fib_list(-3)`,
    ].join('\n');
    expect(() => runPython(snippet)).toThrow(/must be non‑negative/);
  });

  test('non‑integer (float) raises ValueError', () => {
    const snippet = [
      `from fib._core import fib_list`,
      `fib_list(2.5)`,
    ].join('\n');
    expect(() => runPython(snippet)).toThrow(/must be an integer/);
  });

  test('non‑integer (string) raises ValueError', () => {
    const snippet = [
      `from fib._core import fib_list`,
      `fib_list("7")`,
    ].join('\n');
    expect(() => runPython(snippet)).toThrow(/must be an integer/);
  });

  test('length larger than MAX_N raises ValueError', () => {
    const snippet = [
      `from fib._core import fib_list`,
      `fib_list(${MAX_N + 1})`,
    ].join('\n');
    expect(() => runPython(snippet)).toThrow(/too large/);
  });
});

/* -------------------------------------------------------------------------- */
/*                       Test suite – cross‑validation                         */
/* -------------------------------------------------------------------------- */

describe('cross‑validation between fib and fib_list', () => {
  const K = 20; // Small enough for fast execution.

  test('fib(i) matches fib_list(K)[i] for all i < K', () => {
    const list = fibList(K);
    for (let i = 0; i < K; i++) {
      expect(fib(i)).toBe(list[i]);
    }
  });
});