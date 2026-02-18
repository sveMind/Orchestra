import { ShoppingList, stripNewline } from './create-a-shopping-list-in-c-in-a-new-folder-in-examples-';

describe('ShoppingList', () => {
  let list: ShoppingList;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    list = new ShoppingList();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test('list is empty initially', () => {
    expect(list.isEmpty()).toBe(true);
    expect(list.getItems()).toEqual([]);
  });

  test('add a single item', () => {
    list.add('apples');
    expect(list.isEmpty()).toBe(false);
    expect(list.getItems()).toEqual(['apples']);
    expect(consoleLogSpy).toHaveBeenCalledWith('Added: apples');
  });

  test('add multiple items and preserve order', () => {
    list.add('apples');
    list.add('bananas');
    list.add('carrots');
    expect(list.getItems()).toEqual(['apples', 'bananas', 'carrots']);
    expect(consoleLogSpy).toHaveBeenCalledTimes(3);
  });

  test('remove an existing item', () => {
    list.add('apples');
    list.add('bananas');
    list.remove('apples');
    expect(list.getItems()).toEqual(['bananas']);
    expect(consoleLogSpy).toHaveBeenCalledWith('Removed: apples');
  });

  test('remove a non‑existing item', () => {
    list.add('apples');
    list.remove('oranges');
    expect(list.getItems()).toEqual(['apples']);
    expect(consoleLogSpy).toHaveBeenCalledWith('Item not found: oranges');
  });

  test('remove from an empty list', () => {
    list.remove('nothing');
    expect(list.getItems()).toEqual([]);
    expect(consoleLogSpy).toHaveBeenCalledWith('Item not found: nothing');
  });

  test('list items prints formatted output', () => {
    list.add('apples');
    list.add('bananas');
    list.list(); // prints to console
    expect(consoleLogSpy).toHaveBeenCalledWith('1. apples');
    expect(consoleLogSpy).toHaveBeenCalledWith('2. bananas');
  });

  test('list when empty prints appropriate message', () => {
    list.list();
    expect(consoleLogSpy).toHaveBeenCalledWith('The list is empty.');
  });

  test('add duplicate items are allowed', () => {
    list.add('apples');
    list.add('apples');
    expect(list.getItems()).toEqual(['apples', 'apples']);
  });
});

describe('stripNewline', () => {
  test('removes trailing newline', () => {
    const str = 'hello\n';
    expect(stripNewline(str)).toBe('hello');
  });

  test('removes trailing carriage return', () => {
    const str = 'hello\r';
    expect(stripNewline(str)).toBe('hello');
  });

  test('removes both newline and carriage return', () => {
    const str = 'hello\r\n';
    expect(stripNewline(str)).toBe('hello');
  });

  test('does not modify string without trailing newline', () => {
    const str = 'hello';
    expect(stripNewline(str)).toBe('hello');
  });

  test('handles empty string', () => {
    const str = '';
    expect(stripNewline(str)).toBe('');
  });
});