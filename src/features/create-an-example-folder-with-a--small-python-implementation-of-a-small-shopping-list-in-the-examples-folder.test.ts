/**
 * Jest test‑suite for the Python ``ShoppingList`` implementation
 * (examples/shopping_list.py).
 *
 * The tests interact with the Python code via a child‑process
 * execution (`python - <<EOF … EOF`).  This approach lets us keep the
 * test suite in JavaScript/Jest while exercising the real Python
 * class without any additional bindings.
 *
 * The helper `runPython` returns the process result (stdout, stderr,
 * exit status) and is used throughout the suite.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------------
// Helper – execute a short Python snippet and capture its output.
// ---------------------------------------------------------------------
/**
 * Execute a Python script passed as a string.
 *
 * @param {string} code   Python source code.
 * @param {object} opts   Optional spawnSync options.
 * @returns {{stdout:string, stderr:string, status:number}}
 */
function runPython(code, opts = {}) {
  // `- <<'PY'` lets us feed the script via stdin.
  const result = spawnSync('python3', ['- <<PY', '-'], {
    input: code,
    encoding: 'utf8',
    ...opts,
  });
  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    status: result.status,
  };
}

// ---------------------------------------------------------------------
// Temporary directory for persistence tests.
// ---------------------------------------------------------------------
let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopping-list-test-'));
});

afterAll(() => {
  // Cleanup the temporary directory recursively.
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------
// Test suite.
// ---------------------------------------------------------------------
describe('ShoppingList (Python) – Jest integration', () => {
  // -----------------------------------------------------------------
  // Core API – add / list_items
  // -----------------------------------------------------------------
  test('add items and retrieve a sorted list', () => {
    const py = `
from examples.shopping_list import ShoppingList
sl = ShoppingList()
sl.add("apples", 2)
sl.add(" bananas", 1)   # leading/trailing spaces should be stripped
sl.add("apples", 3)    # cumulative quantity
print(sl.list_items())
`;
    const { stdout, status } = runPython(py);
    expect(status).toBe(0);
    // Python prints a list of tuples; eval it safely via JSON conversion.
    // Replace single quotes with double quotes for JSON parsing.
    const json = stdout.replace(/'/g, '"');
    const data = JSON.parse(json);
    expect(data).toEqual([['apples', 5], ['bananas', 1]]);
  });

  test('add with empty name raises ValueError', () => {
    const py = `
from examples.shopping_list import ShoppingList
sl = ShoppingList()
try:
    sl.add("   ", 1)
except ValueError as e:
    print("ERROR:", e)
`;
    const { stdout, status } = runPython(py);
    expect(status).toBe(0);
    expect(stdout).toMatch(/ERROR: Item name must be a non‑empty string/);
  });

  test('add with non‑positive quantity raises ValueError', () => {
    const py = `
from examples.shopping_list import ShoppingList
sl = ShoppingList()
try:
    sl.add("milk", 0)
except ValueError as e:
    print("ERROR:", e)
`;
    const { stdout, status } = runPython(py);
    expect(status).toBe(0);
    expect(stdout).toMatch(/ERROR: Quantity must be a positive integer/);
  });

  // -----------------------------------------------------------------
  // Remove
  // -----------------------------------------------------------------
  test('remove existing item works and removing unknown item raises', () => {
    const py = `
from examples.shopping_list import ShoppingList
sl = ShoppingList()
sl.add("bread", 1)
sl.remove("bread")
print("AFTER_REMOVE:", sl.list_items())
try:
    sl.remove("bread")
except ValueError as e:
    print("ERROR:", e)
`;
    const { stdout, status } = runPython(py);
    expect(status).toBe(0);
    const lines = stdout.split('\\n');
    expect(lines[0]).toBe('AFTER_REMOVE: []');
    expect(lines[1]).toMatch(/ERROR: Item 'bread' not found in the list/);
  });

  // -----------------------------------------------------------------
  // __str__ representation
  // -----------------------------------------------------------------
  test('string representation for empty and non‑empty list', () => {
    const py = `
from examples.shopping_list import ShoppingList
empty = ShoppingList()
print("EMPTY:", str(empty))
sl = ShoppingList()
sl.add("eggs", 12)
sl.add("apples", 4)
sl.add("milk", 2)
print("FULL:", str(sl))
`;
    const { stdout, status } = runPython(py);
    expect(status).toBe(0);
    const lines = stdout.split('\\n');
    expect(lines[0]).toBe('EMPTY: (empty shopping list)');
    // The "FULL:" line contains the multi‑line string – join the rest.
    const fullStr = lines.slice(1).join('\\n').replace(/^FULL: /, '');
    const expected = ['apples: 4', 'eggs: 12', 'milk: 2'].join('\\n');
    expect(fullStr).toBe(expected);
  });

  // -----------------------------------------------------------------
  // Persistence – save & load
  // -----------------------------------------------------------------
  test('save to a file and load back yields identical data', () => {
    const filePath = path.join(tmpDir, 'list.json');
    const py = `
from examples.shopping_list import ShoppingList
import pathlib, json, sys
sl = ShoppingList()
sl.add("apples", 4)
sl.add("bread", 1)
sl.add("milk", 2)
sl.save("${filePath}")
# Now load a new instance
loaded = ShoppingList.load("${filePath}")
print(json.dumps(loaded.list_items()))
`;
    const { stdout, status } = runPython(py);
    expect(status).toBe(0);
    const data = JSON.parse(stdout);
    expect(data).toEqual([['apples', 4], ['bread', 1], ['milk', 2]]);
  });

  test('loading a non‑existent file raises FileNotFoundError', () => {
    const missing = path.join(tmpDir, 'does_not_exist.json');
    const py = `
from examples.shopping_list import ShoppingList
try:
    ShoppingList.load("${missing}")
except FileNotFoundError as e:
    print("ERROR:", e)
`;
    const { stdout, status } = runPython(py);
    expect(status).toBe(0);
    expect(stdout).toMatch(/ERROR: File not found/);
  });

  test('loading a file with corrupted JSON format raises ValueError', () => {
    const badFile = path.join(tmpDir, 'bad.json');
    // Write a raw list (invalid format) before invoking Python.
    fs.writeFileSync(badFile, JSON.stringify(['not', 'a', 'dict']));
    const py = `
from examples.shopping_list import ShoppingList
try:
    ShoppingList.load("${badFile}")
except ValueError as e:
    print("ERROR:", e)
`;
    const { stdout, status } = runPython(py);
    expect(status).toBe(0);
    expect(stdout).toMatch(/ERROR: Invalid data format – expected a JSON object/);
  });

  test('loading a file with wrong key/value types raises ValueError', () => {
    const badFile = path.join(tmpDir, 'type_error.json');
    // Keys must be strings and values ints – we break that.
    const malformed = { 123: "oops", "good": "nope" };
    fs.writeFileSync(badFile, JSON.stringify(malformed));
    const py = `
from examples.shopping_list import ShoppingList
try:
    ShoppingList.load("${badFile}")
except ValueError as e:
    print("ERROR:", e)
`;
    const { stdout, status } = runPython(py);
    expect(status).toBe(0);
    expect(stdout).toMatch(/ERROR: Corrupted data – keys must be strings and values integers/);
  });
});