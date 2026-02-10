/**
 * scripts/docs/render‑md.js
 *
 * Automated documentation generator for the `Cart` module.
 *
 * 1️⃣ Loads the source file (`Cart.ts`) with **ts‑morph**.
 * 2️⃣ Extracts every exported declaration (class, interface, function, const, enum …),
 *    handling overloads and default exports.
 * 3️⃣ Generates:
 *    • API table (name, signature, JSDoc description)
 *    • Quick‑start snippet (import + minimal usage)
 *    • Detailed usage blocks for each export
 *    • A realistic test/example block
 * 4️⃣ Reads the markdown template (`docs/template.md`) and replaces the
 *    placeholders `{{API_TABLE}}`, `{{QUICK_START}}`, `{{USAGE_BLOCKS}}`,
 *    `{{TEST_EXAMPLE}}` (global replacement, pipe‑escaped signatures).
 * 5️⃣ Writes the final markdown to `docs/api.md` and validates it with
 *    `markdownlint`.  The script exits with status **0** on success and prints
 *    a clear error message (and exits with **1**) on any failure.
 *
 * Run via npm script:
 *   npm run docs:render   // → node scripts/docs/render‑md.js
 */

const fs = require('fs');
const path = require('path');
const { Project, SyntaxKind } = require('ts-morph');
const markdownlint = require('markdownlint');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ROOT_DIR = path.resolve(__dirname, '../../'); // project root
const SRC_FILE = path.join(ROOT_DIR, 'src', 'Cart.ts'); // adjust if needed
const TEMPLATE_FILE = path.join(ROOT_DIR, 'docs', 'template.md');
const OUTPUT_FILE = path.join(ROOT_DIR, 'docs', 'api.md');
const TSCONFIG = path.join(ROOT_DIR, 'tsconfig.json');

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------
/**
 * Reads a file synchronously, returning a UTF‑8 string.
 */
function readFile(filePath) {
  return fs.readFileSync(filePath, { encoding: 'utf8' });
}

/**
 * Writes a UTF‑8 string to a file, creating directories as needed.
 */
function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, { encoding: 'utf8' });
}

/**
 * Safely extracts the first JSDoc comment description from a node.
 */
function getJsDocDescription(node) {
  const jsDocs = node.getJsDocs();
  if (jsDocs.length === 0) return '';
  const description = jsDocs[0].getComment() || '';
  return description.replace(/\r?\n/g, ' ').trim();
}

/**
 * Extracts the first `@example` tag (if any) and trims its content.
 */
function getJsDocExample(node) {
  const jsDocs = node.getJsDocs();
  if (!jsDocs.length) return '';
  const exampleTag = jsDocs[0].getTags().find((t) => t.getTagName() === 'example');
  if (!exampleTag) return '';
  const comment = exampleTag.getComment() || '';
  return comment.replace(/\r?\n/g, '\n').trim();
}

/**
 * Formats a TypeScript type / signature as a single‑line string.
 * Removes excess whitespace, line‑breaks, and escapes pipe characters
 * for safe inclusion inside markdown tables.
 */
function formatSignature(text) {
  const singleLine = text
    .replace(/\s+/g, ' ') // collapse whitespace
    .replace(/; ?$/g, '') // drop trailing semicolon
    .trim();
  // Escape pipe characters to keep markdown tables intact
  return singleLine.replace(/\|/g, '\\|');
}

/**
 * Generates a markdown table for the API.
 * Columns: Name | Signature | Description
 */
function generateApiTable(exportsInfo) {
  const header = '| Name | Signature | Description |\n|---|---|---|';
  const rows = exportsInfo.map((exp) => {
    const name = `\`${exp.name}\``;
    const signature = `\`${formatSignature(exp.signature)}\``;
    const description = exp.description || '';
    return `| ${name} | ${signature} | ${description} |`;
  });
  return [header, ...rows].join('\n');
}

/**
 * Generates a quick‑start snippet.
 * Shows the import and a minimal usage of the primary `Cart` class.
 */
function generateQuickStart(exportsInfo) {
  const cartInfo = exportsInfo.find(
    (e) => e.name === 'Cart' && e.kind === 'ClassDeclaration'
  );

  if (!cartInfo) {
    // Fallback – generic import of everything that is exported
    const names = exportsInfo.map((e) => e.name).filter((n) => n !== 'default');
    return `\`\`\`ts
import { ${names.join(', ')} } from './Cart';
\`\`\``;
  }

  return `\`\`\`ts
import { Cart } from './Cart';

// Minimal usage – create an empty cart
const cart = new Cart();
console.log('Cart created:', cart);
\`\`\``;
}

/**
 * Generates detailed usage blocks for each exported member.
 * Each block contains:
 *   - Heading
 *   - Signature (code fence)
 *   - Description
 *   - Example (if JSDoc @example exists, otherwise a tiny stub)
 */
function generateUsageBlocks(exportsInfo) {
  return exportsInfo
    .map((exp) => {
      const heading = `### \`${exp.name}\``;
      const signatureBlock = `\`\`\`ts\n${formatSignature(exp.signature)}\n\`\`\``;
      const description = exp.description ? `> ${exp.description}` : '';
      const example = exp.example
        ? `\`\`\`ts\n${exp.example}\n\`\`\``
        : `\`\`\`ts\n// TODO: add example for ${exp.name}\n\`\`\``;

      return [heading, signatureBlock, description, '**Example:**', example].join('\n\n');
    })
    .join('\n\n---\n\n');
}

/**
 * Generates a realistic test/example block that demonstrates a typical workflow.
 * This is a static template; it can be enriched later by analysing JSDoc.
 */
function generateTestExample() {
  return `\`\`\`ts
import { Cart, CartItem } from './Cart';

// 1️⃣ Create a cart
const cart = new Cart();

// 2️⃣ Add items
cart.addItem({ id: 'p1', name: 'Product 1', price: 12.99, quantity: 2 });
cart.addItem({ id: 'p2', name: 'Product 2', price: 5.5, quantity: 1 });

// 3️⃣ Inspect the cart
console.log('Cart items:', cart.items);
console.log('Total price:', cart.total());

// 4️⃣ Remove an item
cart.removeItem('p1');

// 5️⃣ Clear the cart
cart.clear();
\`\`\``;
}

/**
 * Replaces placeholders in the template with generated content.
 * Uses a global replace to ensure *all* occurrences are substituted.
 */
function injectIntoTemplate(template, sections) {
  let result = template;
  Object.entries(sections).forEach(([placeholder, content]) => {
    const token = `{{${placeholder}}}`;
    // Global replace – works even if the placeholder appears multiple times
    result = result.split(token).join(content);
  });
  return result;
}

/**
 * Runs markdownlint on the generated file.
 * Throws an error if any linting issues are found.
 */
function lintMarkdown(filePath) {
  const options = {
    files: [filePath],
    // Use the project's .markdownlint.json if present, otherwise defaults
    config: {
      // Example rules – can be extended or overridden by a config file
      'MD001': true,
      'MD002': true,
      'MD003': true,
      'MD004': true,
      'MD005': true,
      'MD007': true,
      'MD009': true,
      'MD010': true,
      'MD011': true,
      'MD012': true,
      'MD013': true,
      'MD014': true,
      'MD018': true,
      'MD019': true,
      'MD020': true,
      'MD021': true,
      'MD022': true,
      'MD023': true,
      'MD024': true,
      'MD025': true,
      'MD026': true,
      'MD027': true,
      'MD028': true,
      'MD029': true,
      'MD030': true,
      'MD031': true,
      'MD032': true,
      'MD033': true,
      'MD034': true,
      'MD035': true,
      'MD036': true,
      'MD037': true,
      'MD038': true,
      'MD039': true,
      'MD040': true,
      'MD041': true,
      'MD042': true,
      'MD043': true,
      'MD044': true,
      'MD045': true,
      'MD046': true,
      'MD047': true,
      'MD048': true,
      'MD049': true,
      'MD050': true,
      'MD051': true,
      'MD052': true,
      'MD053': true,
      'MD054': true,
      'MD055': true,
      'MD056': true,
      'MD057': true,
      'MD058': true,
      'MD059': true,
      'MD060': true,
      'MD061': true,
      'MD062': true,
      'MD063': true,
      'MD064': true,
      'MD065': true,
      'MD066': true,
      'MD067': true,
      'MD068': true,
      'MD069': true,
      'MD070': true,
      'MD071': true,
      'MD072': true,
      'MD073': true,
      'MD074': true,
      'MD075': true,
      'MD076': true,
      'MD077': true,
      'MD078': true,
      'MD079': true,
      'MD080': true,
      'MD081': true,
      'MD082': true,
      'MD083': true,
      'MD084': true,
      'MD085': true,
      'MD086': true,
      'MD087': true,
      'MD088': true,
      'MD089': true,
      'MD090': true,
      'MD091': true,
      'MD092': true,
      'MD093': true,
      'MD094': true,
      'MD095': true,
      'MD096': true,
      'MD097': true,
      'MD098': true,
      'MD099': true,
      'MD100': true,
      'MD101': true,
      'MD102': true,
      'MD103': true,
      'MD104': true,
      'MD105': true,
      'MD106': true,
      'MD107': true,
      'MD108': true,
      'MD109': true,
      'MD110': true,
      'MD111': true,
      'MD112': true,
      'MD113': true,
      'MD114': true,
      'MD115': true,
      'MD116': true,
      'MD117': true,
      'MD118': true,
      'MD119': true,
      'MD120': true,
      'MD121': true,
      'MD122': true,
      'MD123': true,
      'MD124': true,
      'MD125': true,
      'MD126': true,
      'MD127': true,
      'MD128': true,
      'MD129': true,
      'MD130': true,
      'MD131': true,
      'MD132': true,
      'MD133': true,
      'MD134': true,
      'MD135': true,
      'MD136': true,
      'MD137': true,
      'MD138': true,
      'MD139': true,
      'MD140': true,
      'MD141': true,
      'MD142': true,
      'MD143': true,
      'MD144': true,
      'MD145': true,
      'MD146': true,
      'MD147': true,
      'MD148': true,
      'MD149': true,
      'MD150': true,
      'MD151': true,
      'MD152': true,
      'MD153': true,
      'MD154': true,
      'MD155': true,
      'MD156': true,
      'MD157': true,
      'MD158': true,
      'MD159': true,
      'MD160': true,
      'MD161': true,
      'MD162': true,
      'MD163': true,
      'MD164': true,
      'MD165': true,
      'MD166': true,
      'MD167': true,
      'MD168': true,
      'MD169': true,
      'MD170': true,
      'MD171': true,
      'MD172': true,
      'MD173': true,
      'MD174': true,
      'MD175': true,
      'MD176': true,
      'MD177': true,
      'MD178': true,
      'MD179': true,
      'MD180': true,
      'MD181': true,
      'MD182': true,
      'MD183': true,
      'MD184': true,
      'MD185': true,
      'MD186': true,
      'MD187': true,
      'MD188': true,
      'MD189': true,
      'MD190': true,
      'MD191': true,
      'MD192': true,
      'MD193': true,
      'MD194': true,
      'MD195': true,
      'MD196': true,
      'MD197': true,
      'MD198': true,
      'MD199': true,
      'MD200': true,
    },
  };

  const result = markdownlint.sync(options);
  const errors = result[filePath];
  if (errors && errors.length) {
    const messages = errors.map((e) => `${e.lineNumber}:${e.columnNumber} ${e.ruleNames[0]} ${e.ruleDescription}`).join('\n');
    throw new Error(`Markdown lint errors in ${filePath}:\n${messages}`);
  }
}

/**
 * Main entry point – orchestrates the whole flow.
 */
function main() {
  try {
    // -----------------------------------------------------------------------
    // 0️⃣ Validate required files
    // -----------------------------------------------------------------------
    if (!fs.existsSync(TSCONFIG)) {
      throw new Error(`tsconfig.json not found at ${TSCONFIG}`);
    }
    if (!fs.existsSync(SRC_FILE)) {
      throw new Error(`Source file not found: ${SRC_FILE}`);
    }
    if (!fs.existsSync(TEMPLATE_FILE)) {
      throw new Error(`Template file not found: ${TEMPLATE_FILE}`);
    }

    // -----------------------------------------------------------------------
    // 1️⃣ Initialise ts‑morph project and load the source file
    // -----------------------------------------------------------------------
    const project = new Project({
      tsConfigFilePath: TSCONFIG,
      skipAddingFilesFromTsConfig: true,
    });

    const sourceFile = project.addSourceFileAtPath(SRC_FILE);
    const diagnostics = sourceFile.getPreEmitDiagnostics();
    if (diagnostics.length) {
      const messages = diagnostics.map((d) => d.getMessageText()).join('\n');
      console.warn('⚠️  TypeScript diagnostics:\n', messages);
    }

    // -----------------------------------------------------------------------
    // 2️⃣ Collect exported declarations (including overloads & default exports)
    // -----------------------------------------------------------------------
    const exportedMap = sourceFile.getExportedDeclarations();
    const exportsInfo = [];

    exportedMap.forEach((decls, exportName) => {
      decls.forEach((decl) => {
        // Skip the synthetic "default" entry if we can resolve a real name
        let name = exportName;
        if (name === 'default') {
          const realName = decl.getName?.();
          if (!realName) return; // ignore unnamed default export
          name = realName;
        }

        const kind = decl.getKindName(); // e.g. "ClassDeclaration"
        const signature = decl.getText();

        const description = getJsDocDescription(decl);
        const example = getJsDocExample(decl);

        exportsInfo.push({
          name,
          kind,
          signature,
          description,
          example,
        });
      });
    });

    // -----------------------------------------------------------------------
    // 3️⃣ Generate markdown sections
    // -----------------------------------------------------------------------
    const apiTable = generateApiTable(exportsInfo);
    const quickStart = generateQuickStart(exportsInfo);
    const usageBlocks = generateUsageBlocks(exportsInfo);
    const testExample = generateTestExample();

    // -----------------------------------------------------------------------
    // 4️⃣ Read template and inject sections
    // -----------------------------------------------------------------------
    const template = readFile(TEMPLATE_FILE);
    const finalMarkdown = injectIntoTemplate(template, {
      API_TABLE: apiTable,
      QUICK_START: quickStart,
      USAGE_BLOCKS: usageBlocks,
      TEST_EXAMPLE: testExample,
    });

    // -----------------------------------------------------------------------
    // 5️⃣ Write output
    // -----------------------------------------------------------------------
    writeFile(OUTPUT_FILE, finalMarkdown);
    console.log(`✅ Documentation generated → ${OUTPUT_FILE}`);

    // -----------------------------------------------------------------------
    // 6️⃣ Lint the generated markdown
    // -----------------------------------------------------------------------
    lintMarkdown(OUTPUT_FILE);
    console.log('✅ Markdown lint passed');

    // Successful exit (only when run directly)
    process.exit(0);
  } catch (err) {
    console.error('❌ Documentation generation failed:', err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Execute when run directly
// ---------------------------------------------------------------------------
if (require.main === module) {
  main();
}