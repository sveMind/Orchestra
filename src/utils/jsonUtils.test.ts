import {
  extractJsonFromText,
  extractJsonObjectFromText,
  extractJsonArrayFromText,
} from './jsonUtils';

describe('extractJsonFromText', () => {
  test('parses plain JSON object text', () => {
    const r = extractJsonFromText('{"a":1,"b":"x"}');
    expect(r).toEqual({ a: 1, b: 'x' });
  });

  test('parses plain JSON array text', () => {
    const r = extractJsonFromText('[1,2,3]');
    expect(r).toEqual([1, 2, 3]);
  });

  test('extracts JSON from within surrounding AI chatter (object first)', () => {
    const text = `Sure! Here is the result:
{
  "summary": "Added login",
  "walkthrough": ["A", "B"],
  "approved": true
}
Let me know if you need anything else.`;
    const r = extractJsonFromText(text);
    expect(r).toEqual({
      summary: 'Added login',
      walkthrough: ['A', 'B'],
      approved: true,
    });
  });

  test('extracts JSON array from within surrounding chatter', () => {
    const text = `Tools to run:
["doc-gen", "vuln-scan"]

Thanks!`;
    expect(extractJsonFromText(text)).toEqual(['doc-gen', 'vuln-scan']);
  });

  test('chooses the structure that appears first when both object and array present', () => {
    const text = 'First {"obj":1} then [2,3]';
    const r = extractJsonFromText(text);
    expect(r).toEqual({ obj: 1 });

    const text2 = 'First [2,3] then {"obj":1}';
    const r2 = extractJsonFromText(text2);
    expect(r2).toEqual([2, 3]);
  });

  test('returns null for empty / invalid input', () => {
    expect(extractJsonFromText('')).toBeNull();
    expect(extractJsonFromText(null as any)).toBeNull();
    expect(extractJsonFromText('not json at all')).toBeNull();
    expect(extractJsonFromText('{ broken json')).toBeNull();
  });

  test('handles JSON in fenced code blocks (loose text)', () => {
    const text = '```json\n{"x": true}\n```';
    expect(extractJsonFromText(text)).toEqual({ x: true });
  });
});

describe('extractJsonObjectFromText', () => {
  test('returns object only (not arrays)', () => {
    expect(extractJsonObjectFromText('{"ok":1}')).toEqual({ ok: 1 });
    expect(extractJsonObjectFromText('[1,2,3]')).toBeNull();
    expect(extractJsonObjectFromText('')).toBeNull();
    expect(extractJsonObjectFromText('just text')).toBeNull();
  });

  test('rejects primitives even if parseable', () => {
    expect(extractJsonObjectFromText('"just a string"')).toBeNull();
    expect(extractJsonObjectFromText('42')).toBeNull();
  });
});

describe('extractJsonArrayFromText', () => {
  test('returns array only (not objects)', () => {
    expect(extractJsonArrayFromText('[1,2,3]')).toEqual([1, 2, 3]);
    expect(extractJsonArrayFromText('{"x":1}')).toBeNull();
    expect(extractJsonArrayFromText('')).toBeNull();
    expect(extractJsonArrayFromText('not json')).toBeNull();
  });

  test('extracts array from AI chatter', () => {
    const text = `Decided plan:

["doc-gen", "test-gen", "vuln-scan"]

Run them in parallel.`;
    expect(extractJsonArrayFromText(text)).toEqual(['doc-gen', 'test-gen', 'vuln-scan']);
  });
});
