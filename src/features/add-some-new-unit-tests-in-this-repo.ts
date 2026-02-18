"""
Unit tests for the `math_utils` module.

The tests follow the AAA (Arrange‑Act‑Assert) pattern and aim to provide
deterministic coverage of the public API.  They are written for pytest
and can be executed locally with:

    $ pytest

Coverage can be generated with:

    $ pytest --cov=math_utils --cov-report=html

The HTML report will be placed in the `htmlcov/` directory.
"""

import pytest

# Import the module under test.  Adjust the import path if the module
# resides in a different package (e.g., `src.math_utils`).
try:
    # When the package is installed in editable mode.
    from math_utils import add, subtract, multiply, divide
except ImportError:  # pragma: no cover
    # Fallback for a repository layout where the source lives under `src/`.
    from src.math_utils import add, subtract, multiply, divide


# ----------------------------------------------------------------------
# Helper fixtures
# ----------------------------------------------------------------------
@pytest.fixture
def positive_numbers():
    """Provide a pair of positive integers."""
    return 12, 3


@pytest.fixture
def negative_numbers():
    """Provide a pair of negative integers."""
    return -8, -2


@pytest.fixture
def mixed_numbers():
    """Provide a positive and a negative integer."""
    return 7, -5


# ----------------------------------------------------------------------
# Tests for `add`
# ----------------------------------------------------------------------
def test_add_positive_numbers(positive_numbers):
    # Arrange
    a, b = positive_numbers

    # Act
    result = add(a, b)

    # Assert
    assert result == 15


def test_add_negative_numbers(negative_numbers):
    # Arrange
    a, b = negative_numbers

    # Act
    result = add(a, b)

    # Assert
    assert result == -10


def test_add_mixed_numbers(mixed_numbers):
    # Arrange
    a, b = mixed_numbers

    # Act
    result = add(a, b)

    # Assert
    assert result == 2


def test_add_zero():
    # Arrange / Act / Assert
    assert add(0, 0) == 0
    assert add(0, 5) == 5
    assert add(7, 0) == 7


# ----------------------------------------------------------------------
# Tests for `subtract`
# ----------------------------------------------------------------------
def test_subtract_positive_numbers(positive_numbers):
    a, b = positive_numbers
    assert subtract(a, b) == 9


def test_subtract_negative_numbers(negative_numbers):
    a, b = negative_numbers
    assert subtract(a, b) == -6


def test_subtract_mixed_numbers(mixed_numbers):
    a, b = mixed_numbers
    assert subtract(a, b) == 12


def test_subtract_to_zero():
    assert subtract(5, 5) == 0
    assert subtract(-3, -3) == 0


# ----------------------------------------------------------------------
# Tests for `multiply`
# ----------------------------------------------------------------------
def test_multiply_positive_numbers(positive_numbers):
    a, b = positive_numbers
    assert multiply(a, b) == 36


def test_multiply_negative_numbers(negative_numbers):
    a, b = negative_numbers
    assert multiply(a, b) == 16


def test_multiply_mixed_numbers(mixed_numbers):
    a, b = mixed_numbers
    assert multiply(a, b) == -35


def test_multiply_by_zero():
    assert multiply(0, 123) == 0
    assert multiply(-7, 0) == 0


# ----------------------------------------------------------------------
# Tests for `divide`
# ----------------------------------------------------------------------
def test_divide_positive_numbers(positive_numbers):
    a, b = positive_numbers
    assert divide(a, b) == 4


def test_divide_negative_numbers(negative_numbers):
    a, b = negative_numbers
    assert divide(a, b) == 4


def test_divide_mixed_numbers(mixed_numbers):
    a, b = mixed_numbers
    assert divide(a, b) == -1.4


def test_divide_by_one():
    assert divide(42, 1) == 42
    assert divide(-5, 1) == -5


def test_divide_by_zero():
    """Dividing by zero should raise a ZeroDivisionError."""
    with pytest.raises(ZeroDivisionError):
        divide(10, 0)