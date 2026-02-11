"""Shopping List package.

Provides a tiny in‑memory shopping‑list implementation that can be used
programmatically or from the command line.
"""

from __future__ import annotations

from typing import List


class ShoppingList:
    """A simple container for shopping‑list items."""

    def __init__(self) -> None:
        self._items: List[str] = []

    def add_item(self, item: str) -> None:
        """Add *item* to the list.

        Duplicate entries are allowed – the list mirrors a real‑world
        shopping list where the same product may be needed more than once.
        """
        self._items.append(item)

    def remove_item(self, item: str) -> bool:
        """Remove the first occurrence of *item*.

        Returns ``True`` if an item was removed, ``False`` otherwise.
        """
        try:
            self._items.remove(item)
            return True
        except ValueError:
            return False

    def list_items(self) -> List[str]:
        """Return a shallow copy of the current items."""
        return list(self._items)


__all__ = ["ShoppingList"]