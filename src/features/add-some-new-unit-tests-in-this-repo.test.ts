/**
 * Jest unit tests for the `math_utils` module.
 *
 * The tests follow the AAA (Arrange‑Act‑Assert) pattern and aim to provide
 * deterministic coverage of the public API. They can be executed locally with:
 *
 *   $ jest
 *
 * Coverage can be generated with:
 *
 *   $ jest --coverage
 *
 * The HTML report will be placed in the `coverage/` directory.
 */

import { add, subtract, multiply, divide } from '../src/math_utils';

describe('math_utils', () => {
  // --------------------------------------------------------------------
  // Helper data
  // --------------------------------------------------------------------
  const positiveNumbers = [12, 3];
  const negativeNumbers = [-8, -2];
  const mixedNumbers = [7, -5];

  // --------------------------------------------------------------------
  // Tests for `add`
  // --------------------------------------------------------------------
  describe('add', () => {
    test('adds positive numbers', () => {
      // Arrange
      const [a, b] = positiveNumbers;

      // Act
      const result = add(a, b);

      // Assert
      expect(result).toBe(15);
    });

    test('adds negative numbers', () => {
      const [a, b] = negativeNumbers;
      expect(add(a, b)).toBe(-10);
    });

    test('adds mixed numbers', () => {
      const [a, b] = mixedNumbers;
      expect(add(a, b)).toBe(2);
    });

    test('adds zeros correctly', () => {
      expect(add(0, 0)).toBe(0);
      expect(add(0, 5)).toBe(5);
      expect(add(7, 0)).toBe(7);
    });
  });

  // --------------------------------------------------------------------
  // Tests for `subtract`
  // --------------------------------------------------------------------
  describe('subtract', () => {
    test('subtracts positive numbers', () => {
      const [a, b] = positiveNumbers;
      expect(subtract(a, b)).toBe(9);
    });

    test('subtracts negative numbers', () => {
      const [a, b] = negativeNumbers;
      expect(subtract(a, b)).toBe(-6);
    });

    test('subtracts mixed numbers', () => {
      const [a, b] = mixedNumbers;
      expect(subtract(a, b)).toBe(12);
    });

    test('subtracts to zero', () => {
      expect(subtract(5, 5)).toBe(0);
      expect(subtract(-3, -3)).toBe(0);
    });
  });

  // --------------------------------------------------------------------
  // Tests for `multiply`
  // --------------------------------------------------------------------
  describe('multiply', () => {
    test('multiplies positive numbers', () => {
      const [a, b] = positiveNumbers;
      expect(multiply(a, b)).toBe(36);
    });

    test('multiplies negative numbers', () => {
      const [a, b] = negativeNumbers;
      expect(multiply(a, b)).toBe(16);
    });

    test('multiplies mixed numbers', () => {
      const [a, b] = mixedNumbers;
      expect(multiply(a, b)).toBe(-35);
    });

    test('multiplies by zero', () => {
      expect(multiply(0, 123)).toBe(0);
      expect(multiply(-7, 0)).toBe(0);
    });
  });

  // --------------------------------------------------------------------
  // Tests for `divide`
  // --------------------------------------------------------------------
  describe('divide', () => {
    test('divides positive numbers', () => {
      const [a, b] = positiveNumbers;
      expect(divide(a, b)).toBe(4);
    });

    test('divides negative numbers', () => {
      const [a, b] = negativeNumbers;
      expect(divide(a, b)).toBe(4);
    });

    test('divides mixed numbers', () => {
      const [a, b] = mixedNumbers;
      // Using toBeCloseTo for floating‑point comparison
      expect(divide(a, b)).toBeCloseTo(-1.4);
    });

    test('divides by one', () => {
      expect(divide(42, 1)).toBe(42);
      expect(divide(-5, 1)).toBe(-5);
    });

    test('throws on division by zero', () => {
      expect(() => divide(10, 0)).toThrow(ZeroDivisionError);
    });
  });
});