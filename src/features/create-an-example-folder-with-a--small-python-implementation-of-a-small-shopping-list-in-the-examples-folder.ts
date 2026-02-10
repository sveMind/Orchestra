#!/usr/bin/env python3
"""Simple shopping‑list CLI example.

Commands:
  add <item>    – add an item to the list
  list          – show all items
  remove <index>– remove an item by its 1‑based index
  exit          – quit the program
  help, -h, --help – show this help message

The script can also be invoked with a sequence of commands on the
command line, e.g.:

    python shopping_list.py "add milk" "add eggs" list

Each quoted string is processed as a single command, which is useful for
automated tests.
"""

import argparse
import sys


def _parse_args() -> argparse.Namespace:
    """Parse optional command‑line commands."""
    parser = argparse.ArgumentParser(
        description="Minimal shopping‑list command‑line example."
    )
    parser.add_argument(
        "commands",
        nargs="*",
        help="Initial commands to process (e.g. \"add milk\" \"add eggs\" list).",
    )
    return parser.parse_args()


def _print_help() -> None:
    """Print the module docstring as help."""
    # ``__doc__`` starts with a newline; strip it for a cleaner output.
    print(__doc__.lstrip())


def _process_line(line: str, shopping: list[str]) -> bool:
    """
    Process a single line of input.

    Returns ``True`` if the REPL should continue, ``False`` to exit.
    """
    parts = line.strip().split()
    if not parts:
        return True

    cmd = parts[0].lower()

    if cmd == "add":
        if len(parts) < 2:
            print("Usage: add <item>")
        else:
            item = " ".join(parts[1:])
            shopping.append(item)
            print(f'Added: "{item}"')
    elif cmd == "list":
        if not shopping:
            print("Shopping list is empty.")
        else:
            for i, item in enumerate(shopping, 1):
                print(f"{i}. {item}")
    elif cmd == "remove":
        if len(parts) != 2 or not parts[1].isdigit():
            print("Usage: remove <index>")
        else:
            idx = int(parts[1]) - 1
            if 0 <= idx < len(shopping):
                removed = shopping.pop(idx)
                print(f'Removed: "{removed}"')
            else:
                print("Invalid index.")
    elif cmd in ("exit", "quit"):
        print("Bye!")
        return False
    elif cmd in ("help", "-h", "--help"):
        _print_help()
    else:
        print(f'Unknown command: {cmd}. Type "help" for usage.')

    return True


def _repl(initial_commands: list[str] | None = None) -> None:
    """Read‑Eval‑Print Loop for the shopping list."""
    shopping: list[str] = []

    # Process any commands supplied on the CLI first.
    if initial_commands:
        for cmd in initial_commands:
            if not _process_line(cmd, shopping):
                return

    # Interactive loop.
    while True:
        try:
            line = input("> ")
        except EOFError:
            # Ctrl‑D / pipe closed
            print("\nBye!")
            break
        except KeyboardInterrupt:
            # Ctrl‑C – exit cleanly without a traceback
            print("\nBye!")
            break
        if not _process_line(line, shopping):
            break


def main() -> None:
    args = _parse_args()
    _repl(initial_commands=args.commands)


if __name__ == "__main__":
    main()