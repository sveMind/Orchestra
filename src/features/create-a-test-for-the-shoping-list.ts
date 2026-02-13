/**
 * Shopping List – End‑to‑End Test Suite
 *
 * This Cypress test file implements the acceptance criteria described in the
 * product backlog for the Shopping List feature.  It is automatically discovered
 * by Cypress (files matching **/*.test.js) and can be executed locally with
 * `npm run test:shopping-list` or in CI.
 *
 * Prerequisites
 *  - Cypress 13+ installed (via devDependency)
 *  - The application under test is reachable via the baseUrl defined in
 *    cypress.config.js (default: http://localhost:3000)
 *
 * Test Structure
 *  1. Test scaffolding – the file itself is the scaffolding.
 *  2. Add item
 *  3. Edit item
 *  4. Remove item
 *  5. Persist across sessions
 *  6. Edge‑case handling (empty, duplicate, special characters)
 *  7. Performance guard (render time for 100 items)
 *
 * The tests are written to be deterministic and isolated – each test
 * starts with a clean slate by clearing localStorage (the app persists data
 * there) and re‑loading the page.  An `afterEach` hook also guarantees cleanup
 * when a test fails.
 */

/// <reference types="cypress" />

// ---------------------------------------------------------------------------
// Fixtures – static data used by edge‑case tests
// ---------------------------------------------------------------------------
const fixtures = {
  valid: { name: 'Apples', quantity: '5' },
  empty: { name: '', quantity: '' },
  duplicate: { name: 'Bananas', quantity: '2' },
  specialChars: { name: 'Café ☕️ 🍰', quantity: '1' },
};

// ---------------------------------------------------------------------------
// Helper functions – keep the test body readable
// ---------------------------------------------------------------------------
/**
 * Adds an item using the UI.
 * @param {{name:string, quantity:string}} item
 */
function addItem(item) {
  cy.get('[data-testid="new-item-name"]').clear().type(item.name);
  cy.get('[data-testid="new-item-quantity"]').clear().type(item.quantity);
  cy.get('[data-testid="add-item-button"]').click();
}

/**
 * Finds a row in the list by item name.
 * @param {string} name
 * @returns {Cypress.Chainable<JQuery<HTMLElement>>}
 */
function getRowByName(name) {
  return cy
    .get('[data-testid="shopping-list"]')
    .contains('[data-testid="list-item"]', name);
}

/**
 * Edits an existing item.
 * @param {string} oldName
 * @param {{name?:string, quantity?:string}} updates
 */
function editItem(oldName, updates) {
  getRowByName(oldName)
    .find('[data-testid="edit-button"]')
    .click();

  if (updates.name !== undefined) {
    cy.get('[data-testid="edit-item-name"]').clear().type(updates.name);
  }
  if (updates.quantity !== undefined) {
    cy.get('[data-testid="edit-item-quantity"]').clear().type(updates.quantity);
  }
  cy.get('[data-testid="save-edit-button"]').click();
}

/**
 * Removes an item.
 * @param {string} name
 */
function removeItem(name) {
  getRowByName(name).find('[data-testid="delete-button"]').click();
}

/**
 * Clears persisted data (localStorage) to guarantee a clean start.
 */
function clearPersistedData() {
  cy.clearLocalStorage();
  cy.reload();
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('Shopping List – End‑to‑End Tests', () => {
  // -----------------------------------------------------------------------
  // Global hooks – ensure a clean environment before and after each test
  // -----------------------------------------------------------------------
  beforeEach(() => {
    clearPersistedData();
    cy.visit('/');
    // Verify the list container is present
    cy.get('[data-testid="shopping-list"]').should('exist');
  });

  // In the storage that a failure does not leave stale data for the next test
  afterEach(() => {
    clearPersistedData();
  });

  // -----------------------------------------------------------------------
  // 2. Add item
  // -----------------------------------------------------------------------
  it('should add a new item and display it correctly', () => {
    addItem(fixtures.valid);
    getRowByName(fixtures.valid.name)
      .should('exist')
      .within(() => {
        cy.get('[data-testid="item-name"]').should('have.text', fixtures.valid.name);
        cy.get('[data-testid="item-quantity"]').should('have.text', fixtures.valid.quantity);
      });
  });

  // -----------------------------------------------------------------------
  // 3. Edit item
  // -----------------------------------------------------------------------
  it('should edit an existing item and reflect the changes', () => {
    // Arrange – add a base item first
    addItem(fixtures.valid);
    const updated = { name: 'Green Apples', quantity: '10' };

    // Act – edit the item
    editItem(fixtures.valid.name, updated);

    // Assert – old name no longer exists, new data appears
    cy.contains('[data-testid="list-item"]', fixtures.valid.name).should('not.exist');
    getRowByName(updated.name)
      .should('exist')
      .within(() => {
        cy.get('[data-testid="item-name"]').should('have.text', updated.name);
        cy.get('[data-testid="item-quantity"]').should('have.text', updated.quantity);
      });
  });

  // -----------------------------------------------------------------------
  // 4. Remove item
  // -----------------------------------------------------------------------
  it('should remove an item from the list', () => {
    addItem(fixtures.valid);
    removeItem(fixtures.valid.name);
    cy.contains('[data-testid="list-item"]', fixtures.valid.name).should('not.exist');
  });

  // -----------------------------------------------------------------------
  // 5. Persist across sessions
  // -----------------------------------------------------------------------
  it('should retain items after a page reload', () => {
    addItem(fixtures.valid);
    addItem(fixtures.specialChars);
    // Wait for any async persistence (localStorage write) to settle
    cy.wait(0);
    // Reload the page (simulating a new session)
    cy.reload();
    // Verify both items are still present
    getRowByName(fixtures.valid.name).should('exist');
    getRowByName(fixtures.specialChars.name).should('exist');
  });

  // -----------------------------------------------------------------------
  // 6. Edge‑case handling
  // -----------------------------------------------------------------------
  describe('Edge‑case handling', () => {
    it('should reject an empty item and show a validation message', () => {
      addItem(fixtures.empty);
      // Validation error – UI may expose a generic error container
      cy.get('[data-testid*="error"]')
        .should('exist')
        .and('contain.text', 'Name and quantity are required');

      // Ensure list stays empty
      cy.get('[data-testid="list-item"]').should('have.length', 0);

      // Extra UI assertions – inputs should still be empty and the add button enabled
      cy.get('[data-testid="new-item-name"]').should('have.value', '');
      cy.get('[data-testid="new-item-quantity"]').should('have.value', '');
      cy.get('[data-testid="add-item-button"]').should('be.enabled');
    });

    it('should handle duplicate items according to business rules', () => {
      addItem(fixtures.duplicate);
      // Attempt to add the same item again
      addItem(fixtures.duplicate);
      // Expect a validation message – may be generic or field‑specific
      cy.get('[data-testid*="error"]')
        .should('exist')
        .and('contain.text', 'Item already exists');

      // List should contain only one instance of the duplicate name
      cy.get('[data-testid="list-item"]')
        .filter(`:contains("${fixtures.duplicate.name}")`)
        .should('have.length', 1);
    });

    it('should accept items with special characters', () => {
      addItem(fixtures.specialChars);
      getRowByName(fixtures.specialChars.name)
        .should('exist')
        .within(() => {
          cy.get('[data-testid="item-name"]').should('have.text', fixtures.specialChars.name);
          cy.get('[data-testid="item-quantity"]').should('have.text', fixtures.specialChars.quantity);
        });
    });
  });

  // -----------------------------------------------------------------------
  // 7. Performance guard
  // -----------------------------------------------------------------------
  it('should render the list within the configured threshold after adding 100 items', () => {
    const ITEM_COUNT = 100;
    const threshold = Cypress.env('PERF_THRESHOLD_MS') || 2000; // ms

    // Capture start time inside the browser context
    cy.window().then(win => {
      const start = win.performance.now();

      // Add items using a proper Cypress chain
      cy.wrap(Array.from({ length: ITEM_COUNT })).each((_, i) => {
        const item = {
          name: `Item ${i + 1}`,
          quantity: `${(i + 1) * 2}`,
        };
        addItem(item);
      })
        .then(() => {
          // Verify the UI has rendered all rows
          cy.get('[data-testid="list-item"]').should('have.length', ITEM_COUNT);
        })
        .then(() => {
          // Capture end time using the same window object
          cy.window().then(win2 => {
            const elapsed = win2.performance.now() - start;
            cy.log(`Render time for ${ITEM_COUNT} items: ${elapsed.toFixed(2)} ms (threshold ${threshold} ms)`);
            expect(elapsed).to.be.lessThan(threshold);
          });
        });
    });
  });
});