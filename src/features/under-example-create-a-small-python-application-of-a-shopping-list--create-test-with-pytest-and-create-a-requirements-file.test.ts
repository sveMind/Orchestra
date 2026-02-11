/**
 * Jest test suite for the top‑level shopping‑list package.
 *
 * The package is expected to expose three named exports:
 *   - ShoppingList (a class / constructor function)
 *   - ItemNotFoundError (an Error subclass)
 *   - __version__ (a string with the package version)
 *
 * These tests verify that the exports exist, have the correct types,
 * and that the version string matches the expected value.
 *
 * No implementation details of `ShoppingList` are assumed here,
 * because the source code is not part of this test suite.
 * The goal is to guarantee a stable public API surface.
 */

const path = require('path');

// Resolve the package entry point relative to this test file.
// Adjust the relative path if your project structure differs.
const pkg = require(path.resolve(__dirname, '../src'));

describe('Shopping‑list package public API', () => {
  test('should export ShoppingList as a class / constructor', () => {
    expect(pkg.ShoppingList).toBeDefined();
    // In JavaScript a class is a function with a prototype.
    expect(typeof pkg.ShoppingList).toBe('function');
    // The constructor should be callable with `new`.
    const instance = new pkg.ShoppingList();
    expect(instance).toBeInstanceOf(pkg.ShoppingList);
  });

  test('should export ItemNotFoundError as an Error subclass', () => {
    expect(pkg.ItemNotFoundError).toBeDefined();
    expect(typeof pkg.ItemNotFoundError).toBe('function');

    // Verify inheritance from Error.
    const err = new pkg.ItemNotFoundError('missing');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(pkg.ItemNotFoundError);
    expect(err.message).toBe('missing');
  });

  test('should export __version__ as the correct string', () => {
    expect(pkg.__version__).toBeDefined();
    expect(typeof pkg.__version__).toBe('string');
    expect(pkg.__version__).toBe('0.1.0');
  });

  test('should not expose unexpected named exports', () => {
    const allowed = ['ShoppingList', 'ItemNotFoundError', '__version__'];
    const exportedKeys = Object.keys(pkg);
    // All exported keys must be in the whitelist.
    exportedKeys.forEach((key) => {
      expect(allowed).toContain(key);
    });
  });

  test('should throw when importing a non‑existent export', () => {
    // Accessing a missing property should yield undefined.
    expect(pkg.NonExistent).toBeUndefined();
    // Trying to use it should result in a TypeError.
    expect(() => {
      // eslint-disable-next-line no-new
      new pkg.NonExistent();
    }).toThrow(TypeError);
  });
});