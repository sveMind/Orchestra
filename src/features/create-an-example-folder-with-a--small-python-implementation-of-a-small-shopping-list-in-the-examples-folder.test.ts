/**
 * Jest test suite for the Python shopping‑list CLI (`shopping_list.py`).
 *
 * The tests exercise the script both via command‑line arguments and via
 * its interactive REPL.  Output is captured from `stdout` and compared against
 * the expected strings.  Prompts (`"> "`) are ignored because they are not
 * part of the functional output.
 *
 * Run the suite with:
 *
 *   npm test   # (or `jest` if you have it installed globally)
 *
 * The test file assumes that `shopping_list.py` lives in the same directory
 * as this test file.
 */

const { spawn } = require("child_process");
const path = require("path");

// Path to the Python script (adjust if the file is relocated)
const SCRIPT_PATH = path.resolve(__dirname, "shopping_list.py");

// Helper: run the script with optional CLI arguments and optional stdin input.
// Returns a Promise that resolves to an object `{ stdout, stderr, code }`.
function runPython(args = [], stdinData = "") {
  return new Promise((resolve) => {
    const proc = spawn("python", [SCRIPT_PATH, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });

    // Feed stdin (if any) and then close the pipe.
    if (stdinData) {
      proc.stdin.write(stdinData);
    }
    proc.stdin.end();
  });
}

// Strip the REPL prompt (`"> "`) and any trailing whitespace for easier comparison.
function normalize(output) {
  return output
    .split("\n")
    .map((line) => line.replace(/^>\s*/, "")) // remove leading prompt
    .filter((line) => line.trim() !== "") // drop empty lines (including the prompt line)
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe("shopping_list.py CLI", () => {
  test("adds items via CLI args and lists them", async () => {
    const { stdout } = await runPython([
      "add milk",
      "add eggs",
      "list",
      "exit",
    ]);

    const out = normalize(stdout);
    expect(out).toContain(`Added: "milk"`);
    expect(out).toContain(`Added: "eggs"`);
    expect(out).toContain(`1. milk`);
    expect(out).toContain(`2. eggs`);
    expect(out).toContain(`Bye!`);
  });

  test("rejects 'add' without an item", async () => {
    const { stdout } = await runPython(["add", "exit"]);
    const out = normalize(stdout);
    expect(out).toContain(`Usage: add <item>`);
    expect(out).toContain(`Bye!`);
  });

  test("rejects 'remove' with non‑numeric index", async () => {
    const { stdout } = await runPython(["remove", "exit"]);
    const out = normalize(stdout);
    expect(out).toContain(`Usage: remove <index>`);
    expect(out).toContain(`Bye!`);
  });

  test("handles out‑of‑range removal", async () => {
    const { stdout } = await runPython([
      "add bread",
      "remove 5",
      "exit",
    ]);
    const out = normalize(stdout);
    expect(out).toContain(`Added: "bread"`);
    expect(out).toContain(`Invalid index.`);
    expect(out).toContain(`Bye!`);
  });

  test("unknown command reports correctly", async () => {
    const { stdout } = await runPython(["foobar", "exit"]);
    const out = normalize(stdout);
    expect(out).toContain(`Unknown command: foobar. Type "help" for usage.`);
    expect(out).toContain(`Bye!`);
  });

  test("help command prints the module docstring", async () => {
    const { stdout } = await runPython(["help", "exit"]);
    const out = normalize(stdout);
    // The docstring begins with a short description line.
    expect(out).toContain(`Simple shopping‑list CLI example.`);
    // The help output should also contain the command list.
    expect(out).toContain(`add <item>    add an item to the list`);
    expect(out).toContain(`list          – show all items`);
    expect(out).toContain(`remove <index>– remove an item by its 1‑based index`);
    expect(out).toContain(`exit          – quit the program`);
    expect(out).toContain(`Bye!`);
  });

  test("interactive REPL works (add, list, remove, exit)", async () => {
    const input = [
      "add apples",
      "add bananas",
      "list",
      "remove 1",
      "list",
      "exit",
    ].join("\n");

    const { stdout } = await runPython([], input);
    const out = normalize(stdout);
    // Sequence of expected outputs:
    expect(out).toContain(`Added: "apples"`);
    expect(out).toContain(`Added: "bananas"`);
    expect(out).toContain(`1. apples`);
    expect(out).toContain(`2. bananas`);
    expect(out).toContain(`Removed: "apples"`);
    // After removal, only bananas should remain.
    expect(out).toContain(`1. bananas`);
    expect(out).toContain(`Bye!`);
  });

  test("Ctrl‑D (EOF) exits cleanly", async () => {
    // No explicit exit command – just close stdin (EOF).
    const { stdout } = await runPython([], "");
    const out = normalize(stdout);
    // The script prints a newline + Bye! when EOF is hit.
    expect(out).toContain(`Bye!`);
  });
});