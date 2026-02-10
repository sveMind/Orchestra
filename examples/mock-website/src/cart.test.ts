// cart.test.ts
import { Cart } from './cart';

describe('Cart', () => {
  let cart: Cart;

  beforeEach(() => {
    cart = new Cart();
  });

  test('initial total is zero', () => {
    expect(cart.getTotal()).toBe(0);
  });

  test('addItem correctly adds an item and updates total', () => {
    cart.addItem('Apple', 1.5);
    expect(cart.getTotal()).toBeCloseTo(1.5);
  });

  test('addItem with multiple items accumulates total correctly', () => {
    cart.addItem('Apple', 1.5);
    cart.addItem('Banana', 2.25);
    cart.addItem('Chocolate', 3);
    expect(cart.getTotal()).toBeCloseTo(6.75);
  });

  test('addItem throws error for zero or negative price', () => {
    expect(() => cart.addItem('Freebie', 0)).toThrow('Price must be positive');
    expect(() => cart.addItem('Debt', -5)).toThrow('Price must be positive');
  });

  test('clear empties the cart and resets total to zero', () => {
    cart.addItem('Apple', 1);
    cart.addItem('Banana', 2);
    expect(cart.getTotal()).toBe(3);
    cart.clear();
    expect(cart.getTotal()).toBe(0);
  });

  test('cart can be reused after clear', () => {
    cart.addItem('Apple', 1);
    cart.clear();
    cart.addItem('Banana', 2);
    expect(cart.getTotal()).toBe(2);
  });

  test('adding items with same name does not affect total calculation', () => {
    cart.addItem('Apple', 1);
    cart.addItem('Apple', 2);
    expect(cart.getTotal()).toBe(3);
  });

  test('floating point addition is handled with tolerance', () => {
    cart.addItem('Item1', 0.1);
    cart.addItem('Item2', 0.2);
    // 0.1 + 0.2 may not be exactly 0.3 due to floating point representation
    expect(cart.getTotal()).toBeCloseTo(0.3, 5);
  });

  test('adding NaN as price does not throw but results in NaN total', () => {
    // TypeScript would normally prevent this, but at runtime it is possible
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    cart.addItem('Mystery', NaN);
    expect(cart.getTotal()).toBeNaN();
  });
});