import { extractCodeBlock } from './codeExtractor';

describe('extractCodeBlock', () => {
  test('returns empty string when no code block exists', () => {
    expect(extractCodeBlock('hello')).toBe('');
  });

  test('extracts code from triple backticks', () => {
    const input = 'text\n```ts\nexport const x = 1;\n```\nmore';
    expect(extractCodeBlock(input)).toBe('export const x = 1;');
  });

  test('falls back to entire response when it looks like code', () => {
    const input = 'import fs from \"fs\";\nexport const x = 1;';
    expect(extractCodeBlock(input)).toBe(input);
  });
});
