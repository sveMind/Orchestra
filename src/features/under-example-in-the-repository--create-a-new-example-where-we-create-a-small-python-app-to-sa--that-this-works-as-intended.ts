"""Demo for the `sa` library.

This script shows a minimal, self‑contained workflow using the
library's simulated‑annealing optimizer. It can be run directly:

    python examples/sa_demo/demo.py

The script prints a deterministic success message that the test
suite checks.
"""

from __future__ import annotations

import sys
from typing import Tuple

# Import the library – the package name is assumed to be `sa`.
# The library is expected to expose a `SimulatedAnnealing` class.
# If the import fails, we provide a clear error message.
try:
    from sa import SimulatedAnnealing
except Exception as exc:  # pragma: no cover
    sys.stderr.write(f"Failed to import `sa` library: {exc}\n")
    raise


def quadratic(x: float) -> float:
    """Simple convex objective: f(x) = (x - 3)^2."""
    return (x - 3.0) ** 2


def run_sa() -> Tuple[float, float]:
    """Run a tiny SA optimisation and return the best point and its value."""
    # Initialise the optimiser with a small search interval.
    optimizer = SimulatedAnnealing(
        func=quadratic,
        bounds=(-10.0, 10.0),
        max_iter=200,
        temperature=10.0,
        cooling_rate=0.95,
        seed=42,  # deterministic seed for reproducibility
    )
    best_x, best_f = optimizer.minimize()
    return best_x, best_f


def main() -> str:
    """Entry point for the demo.

    Returns:
        A deterministic success string.
    """
    best_x, best_f = run_sa()
    # The optimal point for the quadratic is x = 3.0 with value 0.0.
    # Because we use a fixed seed and a modest number of iterations,
    # the optimiser should converge close enough for the demo.
    print(f"Best x: {best_x:.4f}, f(x): {best_f:.4f}")
    success_msg = "SA workflow completed successfully"
    print(success_msg)
    return success_msg


if __name__ == "__main__":
    main()