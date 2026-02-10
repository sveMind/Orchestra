# src/fib/_core.py
"""
fib._core
~~~~~~~~~
Core implementation of the Fibonacci sequence.

The public function :func:`fib` computes the *n‑th* Fibonacci number using the
fast‑doubling method, which runs in **O(log n)** time and **O(1)** additional
memory.  Input validation is performed to ensure a non‑negative integer
that does not exceed the library‑defined maximum (10⁶).  A helper
:func:`fib_list` is also provided for the optional ``--list`` CLI flag.

Both functions raise :class:`ValueError` with a clear message on invalid input.
"""

from __future__ import annotations

from typing import List, Tuple

# --------------------------------------------------------------------------- #
# Configuration constants
# --------------------------------------------------------------------------- #
MAX_N = 10 ** 6  # Upper bound for acceptable input (performance / safety)


# --------------------------------------------------------------------------- #
# Fast‑doubling implementation (pair version)
# --------------------------------------------------------------------------- #
def _fib_pair(n: int) -> Tuple[int, int]:
    """
    Return a tuple ``(F(n), F(n+1))`` using the fast‑doubling recurrence.

    The algorithm works recursively in ``O(log n)`` time and ``O(1)`` extra
    space (apart from the recursion stack, whose depth is bounded by the
    number of bits in ``n``).

    Parameters
    ----------
    n : int
        Non‑negative integer index.

    Returns
    -------
    Tuple[int, int]
        ``(F(n), F(n+1))`` – the n‑th Fibonacci number and its successor.
    """
    if n == 0:
        # Base case: F(0) = 0, F(1) = 1
        return 0, 1

    # Recursively compute (F(k), F(k+1)) where k = n // 2
    a, b = _fib_pair(n >> 1)  # a = F(k), b = F(k+1)

    # Apply the doubling formulas
    c = a * ((b << 1) - a)      # F(2k)   = F(k) * (2·F(k+1) – F(k))
    d = a * a + b * b           # F(2k+1) = F(k)^2 + F(k+1)^2

    if n & 1:
        # n is odd → return (F(2k+1), F(2k+2))
        return d, c + d
    else:
        # n is even → return (F(2k), F(2k+1))
        return c, d


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def fib(n: int) -> int:
    """
    Compute the *n‑th* Fibonacci number.

    The function validates the input, enforcing that ``n`` is a non‑negative
    integer not larger than :data:`MAX_N`.  On success it returns the Fibonacci
    number as a Python ``int``.  On failure a :class:`ValueError` is raised with a
    descriptive message.

    Parameters
    ----------
    n : int
        Index of the desired Fibonacci number (0‑based).

    Returns
    -------
    int
        The n‑th Fibonacci number.

    Raises
    ------
    ValueError
        If ``n`` is not an integer, is negative, or exceeds ``MAX_N``.
    """
    # ---- Input validation -------------------------------------------------
    if not isinstance(n, int):
        raise ValueError(f"Fibonacci index must be an integer, got {type(n).__name__}")

    if n < 0:
        raise ValueError("Fibonacci index must be non‑negative")

    if n > MAX_N:
        raise ValueError(
            f"Fibonacci index too large (>{MAX_N}); "
            "consider using a specialized big‑integer library."
        )

    # ---- Compute -----------------------------------------------------------
    return _fib_pair(n)[0]


def fib_list(k: int) -> List[int]:
    """
    Return a list containing the first ``k`` Fibonacci numbers
    (indices ``0`` … ``k‑1``).

    Parameters
    ----------
    k : int
        Number of Fibonacci numbers to generate.  Must satisfy
        ``0 ≤ k ≤ MAX_N`` (the same upper bound as for :func:`fib`).

    Returns
    -------
    List[int]
        List of the first ``k`` Fibonacci numbers.

    Raises
    ------
    ValueError
        If ``k`` is not a non‑negative integer or exceeds ``MAX_N``.
    """
    if not isinstance(k, int):
        raise ValueError(f"Length must be an integer, got {type(k).__name__}")

    if k < 0:
        raise ValueError("Length must be non‑negative")

    if k > MAX_N:
        raise ValueError(
            f"Requested length too large (>{MAX_N}); "
            "consider generating a smaller subset."
        )

    # Iterative generation is more efficient than repeatedly calling ``fib``.
    result: List[int] = []
    a, b = 0, 1
    for _ in range(k):
        result.append(a)
        a, b = b, a + b
    return result


# --------------------------------------------------------------------------- #
# ``all`` for ``from fib._core import *``
# --------------------------------------------------------------------------- #
__all__ = ["fib", "fib_list"]