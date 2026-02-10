"""Shopping list demo.

Usage:
    python examples/shopping_list.py
"""

import json
import os
from typing import List


class ShoppingList:
    """Simple in‑memory shopping list with optional JSON persistence."""

    def __init__(self, filename: str = "shopping_list.json") -> None:
        self._items: List[str] = []
        self.filename = filename
        self.load()

    def add(self, item: str) -> None:
        """Add an item to the list."""
        self._items.append(item)

    def remove(self, item: str) -> bool:
        """Remove an item; return True if removed, False otherwise."""
        try:
            self._items.remove(item)
            return True
        except ValueError:
            return False

    def list_items(self) -> List[str]:
        """Return a copy of the current items."""
        return list(self._items)

    def save(self) -> None:
        """Persist the list to a JSON file."""
        with open(self.filename, "w", encoding="utf-8") as f:
            json.dump(self._items, f, indent=2)

    def load(self) -> None:
        """Load the list from a JSON file if it exists."""
        if os.path.exists(self.filename):
            try:
                with open(self.filename, "r", encoding="utf-8") as f:
                    self._items = json.load(f)
            except (json.JSONDecodeError, OSError):
                self._items = []


def main() -> None:
    """Demonstrate basic operations of ShoppingList."""
    sl = ShoppingList()

    # Start fresh for demo purposes
    sl._items = []  # type: ignore[attr-defined]

    # Add items
    sl.add("apples")
    sl.add("bread")
    sl.add("milk")
    print("After adding items:", sl.list_items())

    # Remove an item
    sl.remove("bread")
    print("After removing 'bread':", sl.list_items())

    # Persist to file
    sl.save()
    print(f"List saved to {sl.filename}")

    # Load into a new instance to prove persistence
    new_sl = ShoppingList()
    print("Loaded from file:", new_sl.list_items())


if __name__ == "__main__":
    main()