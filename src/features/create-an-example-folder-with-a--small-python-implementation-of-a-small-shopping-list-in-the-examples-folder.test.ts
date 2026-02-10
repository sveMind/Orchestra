/**
 * Jest test suite for the Python module `shopping_list.py`.
 *
 * The tests are executed by spawning a fresh Python interpreter for each
 * test case, guaranteeing that the in‑memory store (`_items`) is reset
 * between runs.  The helper `runPython` runs an arbitrary Python snippet
 * (passed as a string) and returns the captured stdout and stderr.
 *
 * No external npm packages are required – only the built‑in `child_process`
 * and `path` modules.
 */

const { execSync } = require('child_process');
const path = require('path');

/**
 * Execute a Python snippet in a fresh interpreter.
 *
 * @param {string} code   The Python code to execute.
 * @returns {{ stdout: string, stderr: string }}
 */
function runPython(code) {
  // Build a command that runs `python -c "<code>"`.  The code is wrapped in
  // single quotes so we can safely embed double‑quoted strings inside the
  // snippet.  Any single quotes inside the snippet are escaped.
  const escaped = code.replace(/'/g, `\\'`);
  const cmd = `python - <<'PY'\n${code}\nPY`;

  // Use execSync with `encoding: 'utf8'` to get string output.
  try {
    const out = execSync(cmd, { encoding: 'utf8' });
    return { stdout: out, stderr: '' };
  } catch (err) {
    // When the Python process exits with a non‑zero status, execSync throws.
    // The error object contains `stdout` and `stderr`.
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
    };
  }
}

/**
 * Helper to build a Python snippet that imports the module under test.
 *
 * The snippet always starts with `import shopping_list` and then runs the
 * user‑provided body.  This keeps the test code DRY.
 *
 * @param {string} body   Python statements to execute after the import.
 * @returns {string}
 */
function pythonSnippet(body) {
  return `
import sys
import shopping_list
${body}
`;
}

/* -------------------------------------------------------------------------- */
/*  Test Cases                                                               */
/* -------------------------------------------------------------------------- */

describe('shopping_list (Python) – Jest integration', () => {
  test('add_item adds a positive quantity and prints the correct message', () => {
    const snippet = pythonSnippet(`
shopping_list.add_item('apples', 3)
`);
    const { stdout, stderr } = runPython(snippet);
    expect(stderr).toBe('');
    expect(stdout.trim()).toBe("Added 3× 'apples'.");
  });

  test('add_item with default quantity (1) works', () => {
    const snippet = pythonSnippet(`
shopping_list.add_item('bread')
`);
    const { stdout, stderr } = runPython(snippet);
    expect(stderr).toBe('');
    expect(stdout.trim()).toBe("Added 1× 'bread'.");
  });

  test('add_item with zero or negative quantity raises ValueError', () => {
    const snippet = pythonSnippet(`
try:
    shopping_list.add_item('milk', 0)
except ValueError as e:
    print('Error:', e)
`);
    const { stdout, stderr } = runPython(snippet);
    expect(stderr).toBe('');
    // The exact message comes from the Python code.
    expect(stdout.trim()).toBe("Error: quantity must be a positive integer");
  });

  test('remove_item deletes an existing item and prints the correct message', () => {
    const snippet = pythonSnippet(`
shopping_list.add_item('eggs', 2)
shopping_list.remove_item('eggs')
`);
    const { stdout, stderr } = runPython(snippet);
    const lines = stdout.trim().split('\n');
    expect(stderr).toBe('');
    // First line is the add_item message, second line is the remove_item message.
    expect(lines[0]).toBe("Added 2× 'eggs'.");
    expect(lines[1]).toBe("Removed 'eggs' from the list.");
  });

  test('remove_item on a missing key raises KeyError with a helpful message', () => {
    const snippet = pythonSnippet(`
try:
    shopping_list.remove_item('nonexistent')
except KeyError as e:
    print('Error:', e)
`);
    const { stdout, stderr } = runPython(snippet);
    expect(stderr).toBe('');
    expect(stdout.trim()).toBe("Error: 'nonexistent' not found in the shopping list.");
  });

  test('list_items prints a friendly message when the list is empty', () => {
    const snippet = pythonSnippet(`
shopping_list.list_items()
`);
    const { stdout, stderr } = runPython(snippet);
    expect(stderr).toBe('');
    expect(stdout.trim()).toBe('The shopping list is empty.');
  });

  test('list_items prints a sorted list of items with quantities', () => {
    const snippet = pythonSnippet(`
shopping_list.add_item('bananas', 5)
shopping_list.add_item('apples', 2)
shopping_list.add_item('carrots', 3)
shopping_list.list_items()
`);
    const { stdout, stderr } = runPython(snippet);
    expect(stderr).toBe('');
    const lines = stdout.trim().split('\n');
    // First line is the header.
    expect(lines[0]).toBe('Current shopping list:');
    // Subsequent lines are sorted alphabetically.
    expect(lines[1].trim()).toBe("- apples: 2");
    expect(lines[2].trim()).toBe("- bananas: 5");
    expect(lines[3].trim()).toBe("- carrots: 3");
  });

  test('demo runs without uncaught exceptions and prints expected sections', () => {
    const snippet = `
import shopping_list
shopping_list._demo()
`;
    const { stdout, stderr } = runPython(snippet);
    expect(stderr).toBe('');
    // The demo prints several known markers; we just verify they appear.
    const output = stdout;
    expect(output).toContain('=== Shopping List Demo ===');
    expect(output).toContain("Added 3× 'apples'.");
    expect(output).toContain("Added 1× 'bread'.");
    expect(output).toContain("Added 2× 'milk'.");
    expect(output).toContain("Removed 'bread' from the list.");
    expect(output).toContain('Error: \'chocolate\' not found in the shopping list.');
    expect(output).toContain('=== Demo finished ===');
  });
});