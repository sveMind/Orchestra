/**
 * Jest test suite for the ShoppingList example project.
 *
 * These tests verify the core functionality (add, remove, purchase toggle,
 * persistence) and a few edge‑case behaviours. They aim for high code coverage
 * and robust handling of unexpected input.
 *
 * Run the suite with:
 *   npm test
 * (or the equivalent command for your project).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const ShoppingList = require('../src/ShoppingList'); // adjust the import path as needed

/**
 * Helper to create a temporary directory that is automatically cleaned up
 * after the test run. Jest does not provide a built‑in @TempDir decorator,
 * so we manage it manually.
 */
function makeTempDir() {
  const tmpRoot = os.tmpdir();
  return fs.mkdtempSync(path.join(tmpRoot, 'shopping-list-test-'));
}

describe('ShoppingList – core behaviour', () => {
  let shoppingList;

  beforeEach(() => {
    shoppingList = new ShoppingList();
  });

  test('should add an item successfully', () => {
    const itemName = 'Milk';
    shoppingList.addItem(itemName);

    const items = shoppingList.getItems();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe(itemName);
    expect(items[0].purchased).toBe(false);
  });

  test('should not duplicate an existing item', () => {
    const itemName = 'Bread';
    shoppingList.addItem(itemName);
    shoppingList.addItem(itemName); // second call should be a no‑op

    const items = shoppingList.getItems();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe(itemName);
  });

  test('should remove an existing item', () => {
    const itemName = 'Eggs';
    shoppingList.addItem(itemName);
    shoppingList.removeItem(itemName);

    expect(shoppingList.getItems()).toHaveLength(0);
  });

  test('removing a non‑existent item should not crash', () => {
    expect(() => shoppingList.removeItem('Non‑existent')).not.toThrow();
    expect(shoppingList.getItems()).toHaveLength(0);
  });

  test('should toggle the purchased flag correctly', () => {
    const itemName = 'Cheese';
    shoppingList.addItem(itemName);
    const item = shoppingList.getItems()[0];
    expect(item.purchased).toBe(false);

    // first toggle → purchased
    shoppingList.togglePurchased(itemName);
    expect(shoppingList.getItems()[0].purchased).toBe(true);

    // second toggle → not purchased again
    shoppingList.togglePurchased(itemName);
    expect(shoppingList.getItems()[0].purchased).toBe(false);
  });

  test('toggling a non‑existent item should be a no‑op', () => {
    expect(() => shoppingList.togglePurchased('Missing')).not.toThrow();
    // list stays empty
    expect(shoppingList.getItems()).toHaveLength(0);
  });

  test('should reject an empty item name', () => {
    expect(() => shoppingList.addItem('')).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('must not be empty')
      })
    );
  });

  test('should reject a name consisting only of whitespace', () => {
    expect(() => shoppingList.addItem('   ')).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('must not be empty')
      })
    );
  });
});

describe('ShoppingList – persistence', () => {
  let shoppingList;
  let tempDir;

  beforeEach(() => {
    shoppingList = new ShoppingList();
    tempDir = makeTempDir();
  });

  afterAll(() => {
    // Clean up the temporary directory (recursive removal is safe in Node ≥12)
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('should persist and load state correctly', () => {
    // Arrange – create a list with two items, one purchased
    shoppingList.addItem('Apples');
    shoppingList.addItem('Bananas');
    shoppingList.togglePurchased('Bananas'); // mark Bananas as purchased

    // Act – persist to a temporary file
    const filePath = path.join(tempDir, 'shopping-list.json');
    shoppingList.saveToFile(filePath);

    // Simulate a restart by creating a fresh instance and loading the file
    const reloaded = new ShoppingList();
    reloaded.loadFromFile(filePath);

    // Assert – the reloaded list matches the original state
    const items = reloaded.getItems();
    expect(items).toHaveLength(2);

    const apples = items.find(i => i.name === 'Apples');
    const bananas = items.find(i => i.name === 'Bananas');

    expect(apples).toBeDefined();
    expect(apples.purchased).toBe(false);

    expect(bananas).toBeDefined();
    expect(bananas.purchased).toBe(true);
  });

  test('loading from an empty file should result in an empty list', () => {
    const filePath = path.join(tempDir, 'empty.json');
    fs.writeFileSync(filePath, '[]'); // write an empty JSON array

    const list = new ShoppingList();
    list.loadFromFile(filePath);

    expect(list.getItems()).toHaveLength(0);
  });

  test('loading from a non‑existent file should throw an error', () => {
    const missingPath = path.join(tempDir, 'does-not-exist.json');
    const list = new ShoppingList();

    expect(() => list.loadFromFile(missingPath)).toThrow();
  });
});