// cart.ts
/**
 * A simple shopping‑cart implementation hardened against common security issues.
 *
 * - **Price validation** – only finite, non‑negative numbers are accepted.
 * - **Name sanitisation** – HTML tags are stripped and the resulting string is trimmed.
 * - **True runtime privacy** – the internal items array is stored in an
 *   ECMAScript private field (`#items`), making it inaccessible from outside the class.
 * - **Accurate monetary arithmetic** – prices are stored as integer cents to avoid
 *   floating‑point rounding errors.
 */

export class Cart {
  // ECMAScript private field (runtime‑private)
  #items: { name: string; priceCents: number }[] = [];

  /**
   * Adds a new item to the cart.
   *
   * @param name  The display name of the item. HTML tags are stripped.
   * @param price The price in major currency units (e.g., dollars). Must be a finite,
   *              non‑negative number.
   *
   * @throws {Error} If validation fails.
   */
  public addItem(name: string, price: number): void {
    // ----- price validation -----
    if (!Number.isFinite(price) || price < 0) {
      throw new Error('Invalid price: must be a finite, non‑negative number.');
    }

    // Convert to integer cents (avoid floating‑point precision loss)
    // Multiplying by 100 and rounding ensures we store a whole number of cents.
    const priceCents = Math.round(price * 100);
    if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
      throw new Error('Invalid price: out of safe integer range.');
    }

    // ----- name sanitisation -----
    if (typeof name !== 'string') {
      throw new Error('Invalid name: must be a string.');
    }
    // Strip any HTML tags and trim whitespace.
    const sanitized = name.replace(/<[^>]*>/g, '').trim();
    if (sanitized.length === 0) {
      throw new Error('Invalid name: cannot be empty after sanitisation.');
    }
    // Optional: enforce a reasonable maximum length.
    const MAX_NAME_LENGTH = 200;
    if (sanitized.length > MAX_NAME_LENGTH) {
      throw new Error(`Invalid name: exceeds maximum length of ${MAX_NAME_LENGTH} characters.`);
    }

    this.#items.push({ name: sanitized, priceCents });
  }

  /**
   * Returns the total price of all items in the cart, expressed in major units.
   *
   * @returns The cart total (e.g., dollars) as a number with two decimal places.
   */
  public getTotal(): number {
    const totalCents = this.#items.reduce(
      (sum, item) => sum + item.priceCents,
      0
    );
    // Convert back to major units, preserving two decimal places.
    return Number((totalCents / 100).toFixed(2));
  }

  /**
   * Removes all items from the cart.
   */
  public clear(): void {
    // Reset the private array – the previous array becomes eligible for GC.
    this.#items = [];
  }

  /**
   * (Optional) Provides a shallow copy of the cart’s contents for read‑only purposes.
   * The returned objects cannot be used to mutate the internal state.
   */
  public getItems(): ReadonlyArray<{ name: string; priceCents: number }> {
    // Return a new array with frozen item objects to prevent external mutation.
    return this.#items.map(item => Object.freeze({ ...item }));
  }
}