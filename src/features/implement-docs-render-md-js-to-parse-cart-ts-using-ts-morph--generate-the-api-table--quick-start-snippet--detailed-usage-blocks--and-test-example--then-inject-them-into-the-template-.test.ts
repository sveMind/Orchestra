/**
 * Jest unit‑tests for `scripts/docs/render‑md.js`.
 *
 * The tests focus on the pure helper functions as well as the
 * end‑to‑end behaviour of the `main()` entry point.  All
 * filesystem, markdown‑lint and ts‑morph interactions are
 * mocked so the suite runs fast and deterministically.
 */

const rewire = require('rewire');
const path = require('path');
const fs = require('fs');
const markdownlint = require('markdownlint');
const { Project } = require('ts-morph');

// ---------------------------------------------------------------------------
// Mock the external modules
// ---------------------------------------------------------------------------
jest.mock('fs');
jest.mock('markdownlint');
jest.mock('ts-morph');

// ---------------------------------------------------------------------------
// Load the script with rewire – this gives us access to its internal
// functions (they are not exported in the original file).
// ---------------------------------------------------------------------------
const script = rewire('../scripts/docs/render‑md.js');

// Helper to pull a private function out of the module.
const getPrivate = (name) => script.__get__(name);

// ---------------------------------------------------------------------------
// Private helpers under test
// ---------------------------------------------------------------------------
const readFile = getPrivate('readFile');
const writeFile = getPrivate('writeFile');
const getJsDocDescription = getPrivate('getJsDocDescription');
const getJsDocExample = getPrivate('getJsDocExample');
const formatSignature = getPrivate('formatSignature');
const generateApiTable = getPrivate('generateApiTable');
const generateQuickStart = getPrivate('generateQuickStart');
const generateUsageBlocks = getPrivate('generateUsageBlocks');
const generateTestExample = getPrivate('generateTestExample');
const injectIntoTemplate = getPrivate('injectIntoTemplate');
const lintMarkdown = getPrivate('lintMarkdown');
const main = getPrivate('main');

// ---------------------------------------------------------------------------
// Common mocks used by many tests
// ---------------------------------------------------------------------------
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

afterAll(() => {
  mockConsoleLog.mockRestore();
  mockConsoleError.mockRestore();
  mockProcessExit.mockRestore();
});

// ---------------------------------------------------------------------------
// Helper factories for ts‑morph mocks
// ---------------------------------------------------------------------------
function createJsDoc({ comment = '', tags = [] } = {}) {
  return {
    getComment: () => comment,
    getTags: () => tags,
  };
}
function createTag({ tagName = '', comment = '' } = {}) {
  return {
    getTagName: () => tagName,
    getComment: () => comment,
  };
}
function createDecl({
  name = '',
  kindName = '',
  text = '',
  jsDocs = [],
  example = '',
}) {
  return {
    getName: () => name,
    getKindName: () => kindName,
    getText: () => text,
    getJsDocs: () => jsDocs,
  };
}

// ---------------------------------------------------------------------------
// 1️⃣ Tests for pure helper functions
// ---------------------------------------------------------------------------
describe('Helper utilities', () => {
  // -----------------------------------------------------------------------
  // readFile / writeFile – they are thin wrappers around fs, we just
  // verify that they forward the correct arguments.
  // -----------------------------------------------------------------------
  test('readFile reads a UTF‑8 file', () => {
    const fakePath = '/tmp/fake.txt';
    const fakeContent = 'hello world';
    fs.readFileSync.mockReturnValue(fakeContent);
    const result = readFile(fakePath);
    expect(fs.readFileSync).toHaveBeenCalledWith(fakePath, {
      encoding: 'utf8',
    });
    expect(result).toBe(fakeContent);
  });

  test('writeFile creates directories and writes UTF‑8', () => {
    const fakePath = '/tmp/dir/file.txt';
    const fakeContent = 'some content';
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    writeFile(fakePath, fakeContent);
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(fakePath), {
      recursive: true,
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(fakePath, fakeContent, {
      encoding: 'utf8',
    });
  });

  // -----------------------------------------------------------------------
  // getJsDocDescription
  // -----------------------------------------------------------------------
  test('getJsDocDescription returns first JSDoc comment, collapsed', () => {
    const node = createDecl({
      jsDocs: [
        createJsDoc({ comment: 'First line.\nSecond line.' }),
        createJsDoc({ comment: 'Ignored' }),
      ],
    });
    const desc = getJsDocDescription(node);
    expect(desc).toBe('First line. Second line.');
  });

  test('getJsDocDescription returns empty string when no JSDoc', () => {
    const node = createDecl({ jsDocs: [] });
    expect(getJsDocDescription(node)).toBe('');
  });

  // -----------------------------------------------------------------------
  // getJsDocExample
  // -----------------------------------------------------------------------
  test('getJsDocExample extracts @example tag and preserves line‑breaks', () => {
    const node = createDecl({
      jsDocs: [
        createJsDoc({
          tags: [
            createTag({ tagName: 'example', comment: 'const a = 1;\nconsole.log(a);' }),
          ],
        }),
      ],
    });
    const ex = getJsDocExample(node);
    expect(ex).toBe('const a = 1;\nconsole.log(a);');
  });

  test('getJsDocExample returns empty string when no @example tag', () => {
    const node = createDecl({
      jsDocs: [createJsDoc({ tags: [] })],
    });
    expect(getJsDocExample(node)).toBe('');
  });

  // -----------------------------------------------------------------------
  // formatSignature
  // -----------------------------------------------------------------------
  test('formatSignature collapses whitespace, removes trailing semicolon and escapes pipes', () => {
    const raw = `
      function foo<T>(arg: T) : Promise<T> ;
      // comment
    `;
    const formatted = formatSignature(raw);
    expect(formatted).toBe('function foo<T>(arg: T) : Promise<T>');
  });

  test('formatSignature escapes pipe characters', () => {
    const raw = 'type Foo = Bar | Baz;';
    expect(formatSignature(raw)).toBe('type Foo = Bar \\| Baz');
  });

  // -----------------------------------------------------------------------
  // generateApiTable
  // -----------------------------------------------------------------------
  test('generateApiTable creates a markdown table with escaped signatures', () => {
    const exportsInfo = [
      {
        name: 'Cart',
        signature: 'class Cart { /* … */ }',
        description: 'Main cart class.',
      },
      {
        name: 'Item',
        signature: 'type Item = { id: string | number };',
        description: '',
      },
    ];
    const table = generateApiTable(exportsInfo);
    const lines = table.split('\n');
    // header + separator + 2 rows
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('| Name | Signature | Description |');
    expect(lines[2]).toBe(
      '| `Cart` | `class Cart { /* … */ }` | Main cart class. |'
    );
    expect(lines[3]).toBe(
      '| `Item` | `type Item = { id: string \\| number }` |  |'
    );
  });

  // -----------------------------------------------------------------------
  // generateQuickStart
  // -----------------------------------------------------------------------
  test('generateQuickStart returns a Cart‑specific snippet when Cart class exists', () => {
    const exportsInfo = [
      { name: 'Cart', kind: 'ClassDeclaration' },
      { name: 'Helper', kind: 'FunctionDeclaration' },
    ];
    const snippet = generateQuickStart(exportsInfo);
    expect(snippet).toContain("import { Cart } from './Cart';");
    expect(snippet).toContain('const cart = new Cart();');
  });

  test('generateQuickStart falls back to a generic import when Cart is missing', () => {
    const exportsInfo = [
      { name: 'Foo', kind: 'FunctionDeclaration' },
      { name: 'Bar', kind: 'InterfaceDeclaration' },
    ];
    const snippet = generateQuickStart(exportsInfo);
    expect(snippet).toContain('import { Foo, Bar } from \'./Cart\';');
  });

  // -----------------------------------------------------------------------
  // generateUsageBlocks
  // -----------------------------------------------------------------------
  test('generateUsageBlocks creates a block per export with description and example', () => {
    const exportsInfo = [
      {
        name: 'Cart',
        signature: 'class Cart { addItem(item: Item): void; }',
        description: 'Represents a shopping cart.',
        example: 'const c = new Cart();\nc.addItem({ id: "1", name: "A", price: 10, quantity: 1 });',
      },
      {
        name: 'Item',
        signature: 'interface Item { id: string; name: string; price: number; quantity: number; }',
        description: '',
        example: '',
      },
    ];
    const blocks = generateUsageBlocks(exportsInfo);
    // Two blocks separated by "---"
    const parts = blocks.split('\n\n---\n\n');
    expect(parts).toHaveLength(2);
    // First block – description and example present
    expect(parts[0]).toContain('### `Cart`');
    expect(parts[0]).toContain('> Represents a shopping cart.');
    expect(parts[0]).toContain('**Example:**');
    expect(parts[0]).toContain('const c = new Cart();');
    // Second block – stub example
    expect(parts[1]).toContain('### `Item`');
    expect(parts[1]).toContain('**Example:**');
    expect(parts[1]).toContain('// TODO: add example for Item');
  });

  // -----------------------------------------------------------------------
  // generateTestExample – static content
  // -----------------------------------------------------------------------
  test('generateTestExample returns the expected static snippet', () => {
    const snippet = generateTestExample();
    expect(snippet).toContain('import { Cart, CartItem } from \'./Cart\';');
    expect(snippet).toContain('cart.addItem({ id: \'p1\', name: \'Product 1\', price: 12.99, quantity: 2 });');
  });

  // -----------------------------------------------------------------------
  // injectIntoTemplate
  // -----------------------------------------------------------------------
  test('injectIntoTemplate replaces all placeholders globally', () => {
    const tmpl = 'Header\n{{API_TABLE}}\nMiddle\n{{API_TABLE}}\nFooter';
    const sections = {
      API_TABLE: '| Name | Signature | Description |\n|---|---|---|',
    };
    const result = injectIntoTemplate(tmpl, sections);
    const occurrences = (result.match(/{{API_TABLE}}/g) || []).length;
    expect(occurrences).toBe(0);
    expect(result).toContain('| Name | Signature | Description |');
    // should appear twice
    expect(result.split('| Name | Signature | Description |')).toHaveLength(3);
  });

  // -----------------------------------------------------------------------
  // lintMarkdown – success and failure paths
  // -----------------------------------------------------------------------
  test('lintMarkdown passes when markdownlint returns no errors', () => {
    const fakePath = '/tmp/api.md';
    markdownlint.sync.mockReturnValue({ [fakePath]: [] });
    expect(() => lintMarkdown(fakePath)).not.toThrow();
    expect(markdownlint.sync).toHaveBeenCalled();
  });

  test('lintMarkdown throws an error when linting issues are found', () => {
    const fakePath = '/tmp/api.md';
    const fakeError = [
      {
        lineNumber: 3,
        columnNumber: 5,
        ruleNames: ['MD001'],
        ruleDescription: 'Header levels should only increment by one level at a time',
      },
    ];
    markdownlint.sync.mockReturnValue({ [fakePath]: fakeError });
    expect(() => lintMarkdown(fakePath)).toThrow(
      /Markdown lint errors in \/tmp\/api\.md/
    );
  });
});

// ---------------------------------------------------------------------------
// 2️⃣ End‑to‑end test of the `main()` function (filesystem & ts‑morph mocked)
// ---------------------------------------------------------------------------
describe('main() – integration', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();

    // fs.existsSync – all required files exist by default
    fs.existsSync.mockImplementation((p) => true);

    // readFile – template contains the four placeholders
    const template = `
# API Documentation

{{API_TABLE}}

{{QUICK_START}}

{{USAGE_BLOCKS}}

{{TEST_EXAMPLE}}
`;
    fs.readFileSync.mockImplementation((p, opts) => template);

    // writeFile – just capture the content
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});

    // markdownlint – default to success
    markdownlint.sync.mockReturnValue({ [path.join(__dirname, '../../docs/api.md')]: [] });

    // Mock ts‑morph Project and source file
    const mockSourceFile = {
      getPreEmitDiagnostics: () => [],
      getExportedDeclarations: () => {
        // Map<exportName, decl[]>
        const map = new Map();

        // Cart class (with JSDoc)
        const cartDecl = createDecl({
          name: 'Cart',
          kindName: 'ClassDeclaration',
          text: 'class Cart { addItem(item: Item): void; }',
          jsDocs: [
            createJsDoc({
              comment: 'Main cart class.',
              tags: [
                createTag({
                  tagName: 'example',
                  comment: 'const c = new Cart();\nc.addItem({ id: "1", name: "A", price: 10, quantity: 1 });',
                }),
              ],
            }),
          ],
        });
        map.set('Cart', [cartDecl]);

        // Item interface (no JSDoc)
        const itemDecl = createDecl({
          name: 'Item',
          kindName: 'InterfaceDeclaration',
          text: 'interface Item { id: string; name: string; price: number; quantity: number; }',
          jsDocs: [],
        });
        map.set('Item', [itemDecl]);

        // default export (named function)
        const defaultDecl = createDecl({
          name: 'default',
          kindName: 'FunctionDeclaration',
          text: 'export default function init(): void {}',
          jsDocs: [
            createJsDoc({
              comment: 'Initialises the library.',
            }),
          ],
        });
        map.set('default', [defaultDecl]);

        return map;
      },
    };

    const mockProjectInstance = {
      addSourceFileAtPath: () => mockSourceFile,
    };
    Project.mockImplementation(() => mockProjectInstance);
  });

  test('generates markdown, writes file and exits with 0', () => {
    // Run the script
    main();

    // Verify that the output file was written
    const outputPath = path.join(__dirname, '../../docs/api.md');
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      outputPath,
      expect.stringContaining('# API Documentation'),
      { encoding: 'utf8' }
    );

    // Verify that placeholders have been replaced
    const writtenContent = fs.writeFileSync.mock.calls[0][1];
    expect(writtenContent).toContain('| `Cart` | `class Cart { addItem(item: Item): void; }` | Main cart class. |');
    expect(writtenContent).toContain('import { Cart } from \'./Cart\';');
    expect(writtenContent).toContain('### `Item`');
    expect(writtenContent).toContain('**Example:**');
    expect(writtenContent).toContain('// TODO: add example for Item');

    // Verify linting was invoked
    expect(markdownlint.sync).toHaveBeenCalled();

    // Verify process.exit(0) was called
    expect(mockProcessExit).toHaveBeenCalledWith(0);
  });

  test('fails early when a required file is missing', () => {
    // Simulate missing tsconfig.json
    fs.existsSync.mockImplementation((p) => {
      if (p.endsWith('tsconfig.json')) return false;
      return true;
    });

    main();

    // Should have printed an error and exited with 1
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('tsconfig.json not found')
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('fails when markdownlint reports errors', () => {
    // Force lintMarkdown to throw
    const fakePath = path.join(__dirname, '../../docs/api.md');
    markdownlint.sync.mockReturnValue({
      [fakePath]: [
        {
          lineNumber: 5,
          columnNumber: 1,
          ruleNames: ['MD001'],
          ruleDescription: 'Header levels should only increment by one level at a time',
        },
      ],
    });

    main();

    // Expect error output and exit code 1
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Markdown lint errors')
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });
});