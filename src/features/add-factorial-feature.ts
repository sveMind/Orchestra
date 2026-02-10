# calculator.py
"""
A simple calculator module providing basic arithmetic operations
and additional mathematical utilities such as factorial.

The functions are deliberately pure, stateless and type‑annotated
to aid readability, maintainability and static analysis.
"""

from __future__ import annotations

from math import prod
from typing import Union


Number = Union[int, float]


def add(a: Number, b: Number) -> Number:
    """Return the sum of *a* and *b*."""
    return a + b


def subtract(a: Number, b: Number) -> Number:
    """Return the difference of *a* and *b* (a - b)."""
    return a - b


def multiply(a: Number, b: Number) -> Number:
    """Return the product of *a* and *b*."""
    return a * b


def divide(a: Number, b: Number) -> float:
    """
    Return the quotient of *a* divided by *b*.

    Raises:
        ZeroDivisionError: If *b* is zero.
    """
    if b == 0:
        raise ZeroDivisionError("division by zero")
    return a / b


def factorial(n: int) -> int:
    """
    Compute the factorial of a non‑negative integer *n* (n!).

    The implementation uses an iterative approach for clarity and
    avoids recursion limits for large inputs.

    Args:
        n: A non‑negative integer.

    Returns:
        The factorial of *n*.

    Raises:
        ValueError: If *n* is negative.
        TypeError: If *n* is not an integer.
    """
    if not isinstance(n, int):
        raise TypeError(f"factorial() only defined for integers, not {type(n).__name__}")
    if n < 0:
        raise ValueError("factorial() not defined for negative values")

    # Quick returns for the base cases
    if n in (0, 1):
        return 1

    # Compute product of range 2..n
    return prod(range(2, n + 1))


# ----------------------------------------------------------------------
# Example usage (will not run when imported as a module)
# ----------------------------------------------------------------------
if __name__ == "__main__":
    # Basic arithmetic examples
    print(f"3 + 5 = {add(3, 5)}")
    print(f"10 - 4 = {subtract(10, 4)}")
    print(f"7 * 6 = {multiply(7, 6)}")
    print(f"20 / 4 = {divide(20, 4)}")

    # Factorial examples
    for i in range(0, 6):
        print(f"{i}! = {factorial(i)}")