```markdown
```ts
// cart.test.ts
import { Cart } from './cart';

describe('Cart', () => {
  let cart: Cart;

  beforeEach(() => {
    cart = new Cart();
  });

  // ---------- addItem – successful paths ----------
  test('adds a valid item and stores sanitized name', () => {
    cart.addItem('  <b>Apple</b>  ', 1.99);
    const items = cart.getItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ name: 'Apple', priceCents: 199 });
  });

  test('stores price as integer cents with proper rounding', () => {
    // 1.005 should round to 101 cents (1.01)
    cart.addItem('Item', 1.005);
    expect(cart.getItems()[0].priceCents).toBe(101);
  });

  test('handles price zero correctly', () => {
    cart.addItem('Freebie', 0);
    expect(cart.getItems()[0].priceCents).toBe(0);
  });

  // ---------- addItem – price validation ----------
  test('throws when price is NaN', () => {
    expect(() => cart.addItem('Bad', NaN)).toThrow(
      'Invalid price: must be a finite, non‑negative number.'
    );
  });

  test('throws when price is infinite', () => {
    expect(() => cart.addItem('Bad', Infinity)).toThrow(
      'Invalid price: must be a finite, non‑negative number.'
    );
  });

  test('throws when price is negative', () => {
    expect(() => cart.addItem('Bad', -10)).toThrow(
      'Invalid price: must be a finite, non‑negative number.'
    );
  });

  test('throws when priceCents exceeds safe integer range', () => {
    // price * 100 will be larger than Number.MAX_SAFE_INTEGER
    const unsafePrice = Number.MAX_SAFE_INTEGER / 100 + 0.01;
    expect(() => cart.addItem('Bad', unsafePrice)).toThrow(
      'Invalid price: out of safe integer range.'
    );
  });

  // ---------- addItem – name validation ----------
  test('throws when name is not a string', () => {
    // @ts-ignore – intentionally passing wrong type
    expect(() => cart.addItem(123 as any, 1)).toThrow(
      'Invalid name: must be a string.'
    );
  });

  test('throws when sanitized name becomes empty', () => {
    expect(() => cart.addItem('   <b></b>   ', 1)).toThrow(
      'Invalid name: cannot be empty after sanitisation.'
    );
  });

  test('throws when name exceeds maximum length', () => {
    const longName = 'a'.repeat(201);
    expect(() => cart.addItem(longName, 1)).toThrow(
      'Invalid name: exceeds maximum length of 200 characters.'
    );
  });

  // ---------- getTotal ----------
  test('returns zero when cart is empty', () => {
    expect(cart.getTotal()).toBe(0);
  });

  test('calculates total correctly with multiple items', () => {
    cart.addItem('A', 0.99);   // 99c
    cart.addItem('B', 1.01);   // 101c
    cart.addItem('C', 2.5);    // 250c
    // total = 450c => $4.50
    expect(cart.getTotal()).toBeCloseTo(4.5, 2);
  });

  test('returns total with exactly two decimal places', () => {
    cart.addItem('Item', 0.1); // 10c
    const total = cart.getTotal();
    // toFixed(2) ensures a string with two decimals; Number conversion keeps numeric value
    expect(total).toBe(0.1);
    expect(total.toString()).toMatch(/^\d+(\.\d{2})?$/);
  });

  // ---------- clear ----------
  test('clears all items', () => {
    cart.addItem('A', 1);
    cart.addItem('B', 2);
    expect(cart.getItems()).toHaveLength(2);
    cart.clear();
    expect(cart.getItems()).toHaveLength(0);
    expect(cart.getTotal()).toBe(0);
  });

  // ---------- getItems immutability ----------
  test('returns a shallow copy that cannot mutate internal state', () => {
    cart.addItem('Mutable', 1);
    const external = cart.getItems();

    // Trying to modify the returned object should not affect the cart
    // @ts-ignore – intentionally mutating frozen object
    external[0].priceCents = 999;
    expect(cart.getItems()[0].priceCents).toBe(100);

    // Trying to push a new element into the returned array should not affect the cart
    // @ts-ignore – array is not frozen, only its items are frozen
    (external as any).push({ name: 'Hack', priceCents: 500 });
    expect(cart.getItems()).toHaveLength(1);
  });

  // ---------- private field privacy ----------
  test('does not expose the private #items field', () => {
    // Direct access using string key should be undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCart = cart as any;
    expect(anyCart['#items']).toBeUndefined();
  });
});
```
```