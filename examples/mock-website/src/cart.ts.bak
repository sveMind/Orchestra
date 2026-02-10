export class Cart {
  private items: { name: string; price: number }[] = [];

  addItem(name: string, price: number) {
    this.items.push({ name, price });
  }

  getTotal() {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }

  clear() {
    this.items = [];
  }
}
