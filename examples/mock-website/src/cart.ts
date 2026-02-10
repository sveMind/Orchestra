export class Cart {
    private items: { name: string; price: number }[] = [];

    addItem(name: string, price: number) {
        if (price <= 0) throw new Error('Price must be positive');
        this.items.push({ name, price });
    }

    getTotal(): number {
        return this.items.reduce((total, item) => total + item.price, 0);
    }

    clear() {
        this.items = [];
    }
}
