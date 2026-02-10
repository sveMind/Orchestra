"""shopping_list.py

A tiny example demonstrating a simple in‑memory shopping list.

The script provides three core functions:
- add_item(item, quantity=1)
- remove_item(item)
- list_items()

Running the script directly will execute a short demo that adds,
removes, and lists items, printing the state to the console.

No external dependencies beyond the standard library are required.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Dict

# In‑memory store: item -> quantity
_items: Dict[str, int] = defaultdict(int)


def add_item(item: str, quantity: int = 1) -> None:
    """Add *quantity* of *item* to the shopping list.

    If the item already exists, its quantity is increased.
    """
    if quantity <= 0:
        raise ValueError("quantity must be a positive integer")
    _items[item] += quantity
    print(f"Added {quantity}× {item!r}.")


def remove_item(item: str) -> None:
    """Remove *item* from the shopping list.

    Raises:
        KeyError: If the item is not present.
    """
    try:
        del _items[item]
        print(f"Removed {item!r} from the list.")
    except KeyError as exc:
        raise KeyError(f"{item!r} not found in the shopping list.") from exc


def list_items() -> None:
    """Print the current shopping‑list contents."""
    if not _items:
        print("The shopping list is empty.")
        return

    print("Current shopping list:")
    for item, qty in sorted(_items.items()):
        print(f"  - {item}: {qty}")


def _demo() -> None:
    """Run a short demonstration of the API."""
    print("=== Shopping List Demo ===")
    list_items()
    add_item("apples", 3)
    add_item("bread")
    add_item("milk", 2)
    list_items()
    remove_item("bread")
    list_items()
    # Attempt to remove a non‑existent item to show error handling
    try:
        remove_item("chocolate")
    except KeyError as e:
        print(f"Error: {e}")
    print("=== Demo finished ===")


if __name__ == "__main__":
    _demo()