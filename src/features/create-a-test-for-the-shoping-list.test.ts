/**
 * Shopping List – Unit Test Suite (Jest + React Testing Library)
 *
 * These tests exercise the core business logic of the ShoppingList component:
 *   • Adding, editing and removing items
 *   • Validation (empty fields, duplicates)
 *   • Persistence via localStorage
 *   • Edge‑case handling (special characters)
 *
 * The suite mirrors the acceptance criteria expressed in the Cypress
 * end‑to‑end file, but runs as fast, isolated unit tests.
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import ShoppingList from './ShoppingList';

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Returns the list row that contains the given item name.
 */
function getRowByName(name) {
  return screen.getByTestId('shopping-list').querySelector(
    `[data-testid="list-item"]:contains("${name}")`
  );
}

/**
 * Fills the “new item” form and submits it.
 */
function addItem({ name, quantity }) {
  const nameInput = screen.getByTestId('new-item-name');
  const qtyInput = screen.getByTestId('new-item-quantity');
  const addBtn = screen.getByTestId('add-item-button');

  fireEvent.change(nameInput, { target: { value: name } });
  fireEvent.change(qtyInput, { target: { value: quantity } });
  fireEvent.click(addBtn);
}

/**
 * Opens the edit UI for a given item and applies the supplied updates.
 */
function editItem(oldName, updates) {
  const row = screen.getByText(oldName).closest('[data-testid="list-item"]');
  const editBtn = within(row).getByTestId('edit-button');
  fireEvent.click(editBtn);

  if (updates.name !== undefined) {
    const nameInput = screen.getByTestId('edit-item-name');
    fireEvent.change(nameInput, { target: { value: updates.name } });
  }
  if (updates.quantity !== undefined) {
    const qtyInput = screen.getByTestId('edit-item-quantity');
    fireEvent.change(qtyInput, { target: { value: updates.quantity } });
  }

  const saveBtn = screen.getByTestId('save-edit-button');
  fireEvent.click(saveBtn);
}

/**
 * Removes an item by name.
 */
function removeItem(name) {
  const row = screen.getByText(name).closest('[data-testid="list-item"]');
  const delBtn = within(row).getByTestId('delete-button');
  fireEvent.click(delBtn);
}

// ---------------------------------------------------------------------------
// Mock localStorage – the component reads/writes JSON under the key “shoppingList”
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'shoppingList';

function mockLocalStorage() {
  let store = {};

  return {
    getItem: jest.fn(key => (key in store ? store[key] : null)),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn(key => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    // expose the internal store for test‑level inspection
    __getStore: () => store,
  };
}

// ---------------------------------------------------------------------------
// Test data fixtures
// ---------------------------------------------------------------------------
const fixtures = {
  valid: { name: 'Apples', quantity: '5' },
  empty: { name: '', quantity: '' },
  duplicate: { name: 'Bananas', quantity: '2' },
  specialChars: { name: 'Café ☕️ 🍰', quantity: '1' },
};

describe('ShoppingList – Unit Tests', () => {
  let localStorageMock;

  beforeAll(() => {
    // Replace the real localStorage with our mock for the whole suite
    localStorageMock = mockLocalStorage();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
    });
  });

  beforeEach(() => {
    // Ensure a clean slate before each test
    localStorageMock.clear();
    render(<ShoppingList />);
    // Verify the container is present
    expect(screen.getByTestId('shopping-list')).toBeInTheDocument();
  });

  afterEach(() => {
    cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Add item
  // -----------------------------------------------------------------------
  it('adds a new item and displays it correctly', () => {
    addItem(fixtures.valid);
    const row = screen.getByText(fixtures.valid.name).closest('[data-testid="list-item"]');
    expect(row).toBeInTheDocument();

    const nameCell = within(row).getByTestId('item-name');
    const qtyCell = within(row).getByTestId('item-quantity');

    expect(nameCell).toHaveTextContent(fixtures.valid.name);
    expect(qtyCell).toHaveTextContent(fixtures.valid.quantity);
  });

  // -----------------------------------------------------------------------
  // 2. Edit item
  // -----------------------------------------------------------------------
  it('edits an existing item and reflects the changes', async () => {
    // arrange
    addItem(fixtures.valid);
    const updated = { name: 'Green Apples', quantity: '10' };

    // act
    editItem(fixtures.valid.name, updated);

    // assert – old name should disappear
    await waitFor(() => {
      expect(screen.queryByText(fixtures.valid.name)).not.toBeInTheDocument();
    });

    // new data should be present
    const row = screen.getByText(updated.name).closest('[data-testid="list-item"]');
    const nameCell = within(row).getByTestId('item-name');
    const qtyCell = within(row).getByTestId('item-quantity');

    expect(nameCell).toHaveTextContent(updated.name);
    expect(qtyCell).toHaveTextContent(updated.quantity);
  });

  // -----------------------------------------------------------------------
  // 3. Remove item
  // -----------------------------------------------------------------------
  it('removes an item from the list', async () => {
    addItem(fixtures.valid);
    removeItem(fixtures.valid.name);

    await waitFor(() => {
      expect(screen.queryByText(fixtures.valid.name)).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Persistence across renders (localStorage)
  // -----------------------------------------------------------------------
  it('retains items after a component unmount/mount cycle', async () => {
    addItem(fixtures.valid);
    addItem(fixtures.specialChars);

    // Force a re‑render by unmounting and mounting again
    cleanup();
    render(<ShoppingList />);

    // The mock localStorage should have been read and the UI rebuilt
    const rowValid = screen.getByText(fixtures.valid.name).closest('[data-testid="list-item"]');
    const rowSpecial = screen.getByText(fixtures.specialChars.name).closest('[data-testid="list-item"]');

    expect(rowValid).toBeInTheDocument();
    expect(rowSpecial).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 5. Edge‑case handling
  // -----------------------------------------------------------------------
  describe('Edge‑case handling', () => {
    it('rejects an empty item and shows a validation message', () => {
      addItem(fixtures.empty);

      // UI should display a validation error
      const error = screen.getByTestId('validation-error');
      expect(error).toBeInTheDocument();
      expect(error).toHaveTextContent('Name and quantity are required');

      // List must stay empty
      const rows = screen.queryAllByTestId('list-item');
      expect(rows).toHaveLength(0);

      // Inputs should remain empty and the add button enabled
      expect(screen.getByTestId('new-item-name')).toHaveValue('');
      expect(screen.getByTestId('new-item-quantity')).toHaveValue('');
      expect(screen.getByTestId('add-item-button')).toBeEnabled();
    });

    it('handles duplicate items according to business rules', () => {
      addItem(fixtures.duplicate);
      // Attempt to add the same item again
      addItem(fixtures.duplicate);

      const error = screen.getByTestId('validation-error');
      expect(error).toBeInTheDocument();
      expect(error).toHaveTextContent('Item already exists');

      // Only one instance should be present
      const rows = screen.getAllByTestId('list-item');
      const matching = rows.filter(row => within(row).queryByText(fixtures.duplicate.name));
      expect(matching).toHaveLength(1);
    });

    it('accepts items with special characters', () => {
      addItem(fixtures.specialChars);
      const row = screen.getByText(fixtures.specialChars.name).closest('[data-testid="list-item"]');
      const nameCell = within(row).getByTestId('item-name');
      const qtyCell = within(row).getByTestId('item-quantity');

      expect(nameCell).toHaveTextContent(fixtures.specialChars.name);
      expect(qtyCell).toHaveTextContent(fixtures.specialChars.quantity);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Performance guard – adding 100 items should stay under a threshold
  // -----------------------------------------------------------------------
  it('renders 100 items within the configured time threshold', async () => {
    const ITEM_COUNT = 100;
    const THRESHOLD_MS = 2000; // same default as Cypress

    const start = performance.now();

    for (let i = 0; i < ITEM_COUNT; i++) {
      const item = {
        name: `Item ${i + 1}`,
        quantity: `${(i + 1) * 2}`,
      };
      addItem(item);
    }

    // Wait for the DOM to contain all rows
    await waitFor(() => {
      expect(screen.getAllByTestId('list-item')).toHaveLength(ITEM_COUNT);
    });

    const elapsed = performance.now() - start;
    console.log(`Render time for ${ITEM_COUNT} items: ${elapsed.toFixed(2)} ms`);
    expect(elapsed).toBeLessThan(THRESHOLD_MS);
  });
});