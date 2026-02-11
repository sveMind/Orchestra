"""Top‑level package for the shopping‑list CLI."""

from .shopping_list import ShoppingList, ItemNotFoundError

__all__ = ["ShoppingList", "ItemNotFoundError"]
__version__ = "0.1.0"