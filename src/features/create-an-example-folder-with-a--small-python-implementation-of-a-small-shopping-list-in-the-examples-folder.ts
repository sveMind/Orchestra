#!/usr/bin/env python3
"""
examples/shopping_list.py

A tiny, self‑contained example that demonstrates how a typical user
might interact with a shopping‑list utility provided by the library.

The script defines a ``ShoppingList`` class with a small public API
and a ``__main__`` block that exercises the class.  No external
dependencies are required – only the Python standard library.
"""

from __future__ import annotations

import json
import pathlib
from typing import Dict, List, Tuple


class ShoppingList:
    """
    Minimal shopping‑list implementation.

    The list is stored internally as a mapping ``item -> quantity``.
    All public methods raise ``ValueError`` for invalid operations so
    that callers get clear feedback.
    """

    def __init__(self) -> None:
        self._items: Dict[str, int] = {}

    # --------------------------------------------------------------------- #
    # Core API
    # --------------------------------------------------------------------- #
    def add(self, item: str, quantity: int = 1) -> None:
        """
        Add *quantity* of *item* to the list.

        Parameters
        ----------
        item: str
            Name of the product to add.  Empty strings are not allowed.
        quantity: int, optional
            Number of units to add.  Must be a positive integer.
        """
        item = item.strip()
        if not item:
            raise ValueError("Item name must be a non‑empty string.")
        if quantity <= 0:
            raise ValueError("Quantity must be a positive integer.")

        self._items[item] = self._items.get(item, 0) + quantity

    def remove(self, item: str) -> None:
        """
        Remove *item* completely from the list.

        Parameters
        ----------
        item: str
            Name of the product to remove.
        """
        item = item.strip()
        if item not in self._items:
            raise ValueError(f"Item '{item}' not found in the list.")
        del self._items[item]

    def list_items(self) -> List[Tuple[str, int]]:
        """
        Return a list of ``(item, quantity)`` tuples sorted alphabetically.

        Returns
        -------
        List[Tuple[str, int]]
            Sorted representation of the current shopping list.
        """
        return sorted(self._items.items())

    # --------------------------------------------------------------------- #
    # Optional persistence helpers
    # --------------------------------------------------------------------- #
    def save(self, filepath: str | pathlib.Path) -> None:
        """
        Persist the current list to *filepath* as JSON.

        Parameters
        ----------
        filepath: str or pathlib.Path
            Destination file.
        """
        path = pathlib.Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as fp:
            json.dump(self._items, fp, indent=2, sort_keys=True)

    @classmethod
    def load(cls, filepath: str | pathlib.Path) -> "ShoppingList":
        """
        Load a shopping list from *filepath* and return a new ``ShoppingList`` instance.

        Parameters
        ----------
        filepath: str or pathlib.Path
            Source file containing JSON data.

        Returns
        -------
        ShoppingList
            New instance populated with the persisted data.
        """
        path = pathlib.Path(filepath)
        if not path.is_file():
            raise FileNotFoundError(f"File not found: {path}")

        with path.open("r", encoding="utf-8") as fp:
            data = json.load(fp)

        if not isinstance(data, dict):
            raise ValueError("Invalid data format – expected a JSON object.")

        sl = cls()
        for item, qty in data.items():
            if not isinstance(item, str) or not isinstance(qty, int):
                raise ValueError("Corrupted data – keys must be strings and values integers.")
            sl._items[item] = qty
        return sl

    # --------------------------------------------------------------------- #
    # Convenience helpers
    # --------------------------------------------------------------------- #
    def __str__(self) -> str:
        if not self._items:
            return "(empty shopping list)"
        lines = [f"{item}: {qty}" for item, qty in self.list_items()]
        return "\n".join(lines)


# ------------------------------------------------------------------------- #
# Demo when the file is executed directly
# ------------------------------------------------------------------------- #
if __name__ == "__main__":
    demo = ShoppingList()
    demo.add("apples", 4)
    demo.add("bread")
    demo.add("milk", 2)
    demo.remove("bread")
    demo.add("eggs", 12)

    print("Current shopping list:")
    print(demo)

    # Demonstrate persistence
    demo_file = pathlib.Path("shopping_list_demo.json")
    demo.save(demo_file)
    print(f"\nSaved list to {demo_file}")

    loaded = ShoppingList.load(demo_file)
    print("\nLoaded list from file:")
    print(loaded)