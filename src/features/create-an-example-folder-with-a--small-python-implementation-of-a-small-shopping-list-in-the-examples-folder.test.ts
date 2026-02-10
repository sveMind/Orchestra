/**
 * Jest test suite for the Python `ShoppingList` implementation
 * (examples/shopping_list.py).
 *
 * The tests interact with the Python class by spawning a short Python
 * snippet that imports the class, performs operations and prints the
 * result as JSON on stdout.  This approach keeps the test suite pure
 * JavaScript while still exercising the original Python code.
 *
 * Prerequisites:
 *   - `python` (or `python3`) must be available on the PATH.
 *   - The repository root contains `examples/shopping_list.py`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const PYTHON_CMD = process.env.PYTHON_CMD || 'python'; // allow override

/**
 * Execute a Python snippet and return stdout as a string.
 *
 * @param {string} code - The Python code to execute.
 * @param {Object} [env] - Optional environment variables.
 * @returns {string} Raw stdout from the Python process.
 */
function runPython(code, env = {}) {
  // Use a temporary file to avoid issues with quoting on Windows.
  const tmpFile = path.join(os.tmpdir(), `tmp_py_${Date.now()}.py`);
  fs.writeFileSync(tmpFile, code, { encoding: 'utf-8' });

  try {
    const output = execSync(`${PYTHON_CMD} "${tmpFile}"`, {
      env: { ...process.env, ...env },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.trim();
  } finally {
    // Cleanup the temporary script file.
    fs.unlinkSync(tmpFile);
  }
}

/**
 * Helper that creates a fresh temporary JSON file for persistence tests.
 *
 * @returns {string} Absolute path to a non‑existent temporary file.
 */
function makeTempJsonFile() {
  const tmpDir = os.tmpdir();
  const fileName = `shopping_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
  return path.join(tmpDir, fileName);
}

/**
 * Build a Python snippet that imports the ShoppingList class from the
 * example file and runs a user‑provided callback.
 *
 * @param {string} body - Python statements to execute after the import.
 * @param {Object} [options] - Optional settings.
 * @param {string} [options.filename] - Custom persistence filename.
 * @returns {string} Full Python script.
 */
function buildSnippet(body, { filename } = {}) {
  const importPath = path.resolve(__dirname, '..', 'examples', 'shopping_list.py');
  const importLine = `import sys, json; sys.path.append('${path.dirname(importPath)}'); from shopping_list import ShoppingList`;
  const initLine = filename ? `sl = ShoppingList(filename="${filename}")` : `sl = ShoppingList()`;
  return `${importLine}\n${initLine}\n${body}\n`;
}

/* -------------------------------------------------------------------------- */
/*                              Test Suite                                   */
/* -------------------------------------------------------------------------- */

describe('ShoppingList (Python) – Jest integration', () => {
  const tempFiles = [];

  // Ensure any temporary JSON files are removed after the suite runs.
  afterAll(() => {
    tempFiles.forEach((p) => {
      try {
        fs.unlinkSync(p);
      } catch (_) {
        // ignore errors – file may already be gone
      }
    });
  });

  test('add() appends items and list_items() returns a copy', () => {
    const py = buildSnippet(`
sl.add("apples")
sl.add("bread")
print(json.dumps(sl.list_items()))
`);
    const out = runPython(py);
    const items = JSON.parse(out);
    expect(items).toEqual(['apples', 'bread']);
  });

  test('remove() returns true for existing items and false otherwise', () => {
    const py = buildSnippet(`
sl.add("milk")
print(sl.remove("milk"))          # should be true
print(sl.remove("nonexistent"))   # should be false
`);
    const out = runPython(py);
    const [first, second] = out.split('\n').map((s) => s.trim());
    expect(first).toBe('True');
    expect(second).toBe('False');
  });

  test('list_items() returns a shallow copy (mutating the result does not affect the list)', () => {
    const py = buildSnippet(`
sl.add("eggs")
lst = sl.list_items()
lst.append("cheese")   # mutate the copy
print(json.dumps(sl.list_items()))
`);
    const out = runPython(py);
    const items = JSON.parse(out);
    expect(items).toEqual(['eggs']);
  });

  test('save() writes JSON to the specified file and load() restores it', () => {
    const tmpFile = makeTempJsonFile();
    tempFiles.push(tmpFile);

    // 1️⃣ Save a list to disk
    const saveSnippet = buildSnippet(
      `
sl.add("apples")
sl.add("bread")
sl.save()
print("saved")
`,
      { filename: tmpFile }
    );
    const saveOut = runPython(saveSnippet);
    expect(saveOut).toBe('saved');

    // Verify file exists and contains the expected JSON
    const raw = fs.readFileSync(tmpFile, 'utf-8');
    const persisted = JSON.parse(raw);
    expect(persisted).toEqual(['apples', 'bread']);

    // 2️⃣ Load the list in a fresh instance
    const loadSnippet = buildSnippet(
      `
print(json.dumps(sl.list_items()))
`,
      { filename: tmpFile }
    );
    const loadOut = runPython(loadSnippet);
    const loaded = JSON.parse(loadOut);
    expect(loaded).toEqual(['apples', 'bread']);
  });

  test('load() gracefully handles missing file (starts empty)', () => {
    const nonExistent = path.join(os.tmpdir(), `does_not_exist_${Date.now()}.json`);
    const py = buildSnippet(
      `
print(json.dumps(sl.list_items()))
`,
      { filename: nonExistent }
    );
    const out = runPython(py);
    const items = JSON.parse(out);
    expect(items).toEqual([]);
  });

  test('load() clears items when the JSON file is corrupted', () => {
    const tmpFile = makeTempJsonFile();
    tempFiles.push(tmpFile);
    // Write malformed JSON
    fs.writeFileSync(tmpFile, '{ not: json', { encoding: 'utf-8' });

    const py = buildSnippet(
      `
print(json.dumps(sl.list_items()))
`,
      { filename: tmpFile }
    );
    const out = runPython(py);
    const items = JSON.parse(out);
    expect(items).toEqual([]);
  });

  test('multiple instances share the same persisted file', () => {
    const tmpFile = makeTempJsonFile();
    tempFiles.push(tmpFile);

    // Instance A – add items and save
    const aSnippet = buildSnippet(
      `
sl.add("a")
sl.add("b")
sl.save()
`,
      { filename: tmpFile }
    );
    runPython(aSnippet);

    // Instance B – load from the same file
    const bSnippet = buildSnippet(
      `
print(json.dumps(sl.list_items()))
`,
      { filename: tmpFile }
    );
    const out = runPython(bSnippet);
    const items = JSON.parse(out);
    expect(items).toEqual(['a', 'b']);
  });
});