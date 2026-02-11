/**
 * Jest test suite for the tiny Python shopping‑list CLI.
 *
 * The tests create a temporary copy of the `shopping_list` package,
 * run the module as a subprocess (`python -m shopping_list`) and verify
 * its behaviour via stdout/stderr.
 *
 * The suite covers:
 *   • Loading an empty or corrupt data file
 *   • Adding, removing and clearing items
 *   • Persistence across separate runs
 *   • Edge‑case handling for invalid command arguments
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let tempDir;      // root temporary directory for the test run
let pkgDir;       // path to the temporary `shopping_list` package

/**
 * Write the supplied Python source code to `__main__.py` inside the
 * temporary package directory.
 */
function writePackageFiles() {
  // empty __init__.py – required for a proper package
  fs.writeFileSync(path.join(pkgDir, '__init__.py'), '');

  // The full source of the original `shopping_list` module.
  const source = `"""
shopping_list
==============

A tiny command‑line shopping‑list utility.

Run it as a module:

    python -m shopping_list

or execute the file directly:

    python shopping_list/__main__.py

The list is stored in \`shopping.json\` in the package directory and is
loaded on start‑up.  All mutating commands automatically persist the updated
list.
"""

import json
import sys
from pathlib import Path
from typing import List

# ----------------------------------------------------------------------
# Persistence helpers
# ----------------------------------------------------------------------
# Store the data file next to this module (i.e. inside the package).  This
# makes the location deterministic regardless of the current working
# directory from which the user runs the command.
DATA_FILE = Path(__file__).with_name("shopping.json")


def _load_data() -> List[str]:
    """Load the shopping list from \`DATA_FILE\`.

    Returns an empty list if the file does not exist or cannot be parsed.
    """
    if not DATA_FILE.is_file():
        return []
    try:
        with DATA_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            # Ensure all elements are strings
            return [str(item) for item in data]
    except (json.JSONDecodeError, OSError):
        # Corrupt or unreadable file – start with an empty list.
        pass
    return []


def _save_data(items: List[str]) -> None:
    """Write the shopping list to \`DATA_FILE\` atomically.

    The function writes to a temporary file first and then replaces the
    original file.  This prevents a partially‑written file if the process
    is interrupted.
    """
    tmp_file = DATA_FILE.with_suffix(".tmp")
    try:
        with tmp_file.open("w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
        tmp_file.replace(DATA_FILE)
    except OSError as exc:
        print(f"Error: could not write to {DATA_FILE}: {exc}", file=sys.stderr)


# ----------------------------------------------------------------------
# Core model
# ----------------------------------------------------------------------
class ShoppingList:
    """In‑memory representation of a shopping list."""

    def __init__(self) -> None:
        self._items: List[str] = _load_data()

    # ------------------------------------------------------------------
    # Mutating operations – each persists the list
    # ------------------------------------------------------------------
    def add(self, item: str) -> None:
        """Add *item* to the end of the list."""
        self._items.append(item)
        _save_data(self._items)

    def remove(self, index: int) -> bool:
        """Remove the item at *index* (0‑based).

        Returns ``True`` if the removal succeeded, ``False`` otherwise.
        """
        if 0 <= index < len(self._items):
            del self._items[index]
            _save_data(self._items)
            return True
        return False

    def clear(self) -> None:
        """Empty the whole list."""
        self._items.clear()
        _save_data(self._items)

    # ------------------------------------------------------------------
    # Read‑only helpers
    # ------------------------------------------------------------------
    def list_items(self) -> List[str]:
        """Return a copy of the current items."""
        return list(self._items)

    def __len__(self) -> int:
        return len(self._items)


# ----------------------------------------------------------------------
# CLI implementation
# ----------------------------------------------------------------------
def _print_help() -> None:
    help_text = """
Available commands (case‑insensitive):
  add <item>       – add an item to the list
  list             – show all items with their index
  remove <index>   – delete the item at the given index (0‑based)
  clear            – empty the whole list
  help             – show this help message
  exit | quit      – terminate the program
"""
    print(help_text.strip())


def _handle_add(lst: ShoppingList, args: str) -> None:
    if not args.strip():
        print("Error: 'add' requires an item description.")
        return
    lst.add(args.strip())
    print(f"Added: {args.strip()}")


def _handle_list(lst: ShoppingList) -> None:
    items = lst.list_items()
    if not items:
        print("(empty)")
        return
    for idx, item in enumerate(items):
        print(f"{idx}: {item}")


def _handle_remove(lst: ShoppingList, args: str) -> None:
    if not args.strip():
        print("Error: 'remove' requires an index.")
        return
    try:
        index = int(args.strip())
        if index < 0:
            raise ValueError
    except ValueError:
        print("Error: index must be a non‑negative integer.")
        return
    if lst.remove(index):
        print(f"Removed item at index {index}.")
    else:
        print(f"Error: no item at index {index}.")


def _handle_clear(lst: ShoppingList) -> None:
    if len(lst) == 0:
        print("List already empty.")
    else:
        lst.clear()
        print("All items cleared.")


def _dispatch_command(lst: ShoppingList, line: str) -> bool:
    """Parse *line* and execute the corresponding command.

    Returns ``True`` if the loop should continue, ``False`` to exit.
    """
    if not line.strip():
        return True  # ignore empty lines

    parts = line.strip().split(maxsplit=1)
    cmd = parts[0].lower()
    args = parts[1] if len(parts) > 1 else ""

    if cmd == "add":
        _handle_add(lst, args)
    elif cmd == "list":
        _handle_list(lst)
    elif cmd == "remove":
        _handle_remove(lst, args)
    elif cmd == "clear":
        _handle_clear(lst)
    elif cmd in ("exit", "quit"):
        return False
    elif cmd == "help":
        _print_help()
    else:
        print(f"Error: unknown command '{cmd}'. Type 'help' for a list of commands.")
    return True


def main() -> None:
    """Entry point for the shopping‑list CLI."""
    shopping_list = ShoppingList()
    print("Shopping List – type 'help' for commands.")
    while True:
        try:
            line = input("> ")
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break
        if not _dispatch_command(shopping_list, line):
            break


# ----------------------------------------------------------------------
# When executed as a script or module
# ----------------------------------------------------------------------
if __name__ == "__main__":
    main()
`;
  fs.writeFileSync(path.join(pkgDir, '__main__.py'), source);
}

/**
 * Run the CLI as a subprocess, feeding it *commands* (a newline‑separated
 * string).  Returns the `spawnSync` result.
 */
function runCli(commands) {
  return spawnSync('python', ['-m', 'shopping_list'], {
    input: commands,
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: tempDir },
    cwd: tempDir,
  });
}

/* --------------------------------------------------------------- */
/* Test suite                                                       */
/* --------------------------------------------------------------- */

beforeAll(() => {
  // Create an isolated temporary directory for the whole suite
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopping-list-test-'));
  pkgDir = path.join(tempDir, 'shopping_list');
  fs.mkdirSync(pkgDir);
  writePackageFiles();
});

afterAll(() => {
  // Clean up the temporary directory recursively
  fs.rmSync(tempDir, { recursive: true, force: true });
});

/* Helper to ensure a clean data file before each test */
beforeEach(() => {
  const dataFile = path.join(pkgDir, 'shopping.json');
  if (fs.existsSync(dataFile)) {
    fs.unlinkSync(dataFile);
  }
});

test('list on an empty list shows "(empty)"', () => {
  const result = runCli('list\nexit\n');
  expect(result.stdout).toContain('(empty)');
});

test('add an item and list it', () => {
  const result = runCli('add Milk\nlist\nexit\n');
  expect(result.stdout).toContain('Added: Milk');
  expect(result.stdout).toContain('0: Milk');
});

test('add without a description prints an error', () => {
  const result = runCli('add \nexit\n');
  expect(result.stdout).toContain("Error: 'add' requires an item description.");
});

test('remove a non‑existent index prints an error', () => {
  const result = runCli('add Bread\nremove 5\nexit\n');
  expect(result.stdout).toContain('Error: no item at index 5.');
});

test('remove without an index prints an error', () => {
  const result = runCli('remove \nexit\n');
  expect(result.stdout).toContain("Error: 'remove' requires an index.");
});

test('remove with a non‑integer index prints an error', () => {
  const result = runCli('remove abc\nexit\n');
  expect(result.stdout).toContain('Error: index must be a non‑negative integer.');
});

test('remove with a negative index prints an error', () => {
  const result = runCli('remove -1\nexit\n');
  expect(result.stdout).toContain('Error: index must be a non‑negative integer.');
});

test('clear empties the list and reports correctly', () => {
  const result = runCli('add Eggs\nclear\nlist\nexit\n');
  expect(result.stdout).toContain('All items cleared.');
  expect(result.stdout).toContain('(empty)');
});

test('clear on an already empty list reports it is empty', () => {
  const result = runCli('clear\nexit\n');
  expect(result.stdout).toContain('List already empty.');
});

test('persistence across separate runs', () => {
  // First run: add two items and exit
  runCli('add Apple\nadd Banana\nexit\n');

  // Second run: list items – they should still be present
  const result = runCli('list\nexit\n');
  expect(result.stdout).toContain('0: Apple');
  expect(result.stdout).toContain('1: Banana');
});

test('corrupt JSON file results in an empty list', () => {
  const dataFile = path.join(pkgDir, 'shopping.json');
  fs.writeFileSync(dataFile, '{ not json'); // deliberately malformed
  const result = runCli('list\nexit\n');
  expect(result.stdout).toContain('(empty)');
});

test('unknown command prints a helpful error', () => {
  const result = runCli('foobar\nexit\n');
  expect(result.stdout).toContain("Error: unknown command 'foobar'.");
});

test('help command displays the help text', () => {
  const result = runCli('help\nexit\n');
  expect(result.stdout).toContain('Available commands');
  expect(result.stdout).toContain('add <item>');
  expect(result.stdout).toContain('list');
  expect(result.stdout).toContain('remove <index>');
  expect(result.stdout).toContain('clear');
  expect(result.stdout).toContain('help');
  expect(result.stdout).toContain('exit | quit');
});