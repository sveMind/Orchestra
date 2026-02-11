#!/usr/bin/env python
"""
Simple SA demo using the library's `sa` module.

The script runs a tiny simulated‑annealing optimisation that
minimises a quadratic function with a known minimum at x = 3.
"""

import random
from sa import SimulatedAnnealing  # the library under test


def objective(x: float) -> float:
    """Quadratic objective – minimum at x = 3."""
    return (x - 3) ** 2


def main() -> None:
    # Deterministic run – useful for CI / documentation
    random.seed(0)

    sa = SimulatedAnnealing(
        objective=objective,
        bounds=(-10, 10),      # search interval
        max_iter=1000,        # number of iterations
        initial_temp=10.0,    # starting temperature
        cooling_rate=0.99,    # exponential cooling
    )
    best_x, best_val = sa.run()
    print(f"Best x: {best_x:.4f}, value: {best_val:.6f}")


if __name__ == "__main__":
    main()