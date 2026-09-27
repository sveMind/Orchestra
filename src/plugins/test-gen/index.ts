import { OrchestraPlugin } from '../../types';
import { AgentRole, consultAgentRouted } from '../../services/agentService';
import fs from 'fs';
import path from 'path';
import { extractCodeBlock } from '../../utils/codeExtractor';

export const generateTests = async (filePath: string): Promise<void> => {
    await plugin.action(filePath);
};

const detectFramework = (extraArgs: any[] | undefined, filePath: string): 'jest' | 'pytest' | 'c' => {
    const ext = path.extname(filePath).toLowerCase();
    const rawFramework = extraArgs && extraArgs[0] ? String(extraArgs[0]).toLowerCase() : '';

    if (rawFramework.includes('py')) return 'pytest';
    if (rawFramework === 'c') return 'c';
    if (!rawFramework) {
        if (ext === '.py') return 'pytest';
        if (ext === '.c' || ext === '.h') return 'c';
    }
    return 'jest';
};

const resolveTestFile = (originalPath: string, framework: 'jest' | 'pytest' | 'c'): string => {
    const ext = path.extname(originalPath);
    const lowerExt = ext.toLowerCase();
    if (framework === 'pytest') {
        const dir = path.dirname(originalPath);
        const base = path.basename(originalPath, ext);
        return path.join(dir, `test_${base}${ext}`);
    }
    if (framework === 'c') {
        const dir = path.dirname(originalPath);
        const base = path.basename(originalPath, ext || '.c');
        const finalExt = lowerExt || '.c';
        return path.join(dir, `${base}_test${finalExt}`);
    }
    return originalPath.replace(ext, `.test${ext}`);
};

const buildJestTask = (fileName: string, existingTests: string, sourceContent: string): string => {
    const relImport = `./${path.basename(fileName, path.extname(fileName))}`;
    const mode = existingTests
        ? `An existing test file already exists. Its current contents:
\`\`\`ts
${existingTests.slice(0, 8000)}
\`\`\`

UPDATE or EXTEND the existing test file. Keep all passing describe/it blocks intact. ADD new tests only for uncovered scenarios. DO NOT invent existing tests back if they are gone; instead preserve structure of existing ${/describe\(/.test(existingTests) ? 'describe blocks' : 'tests'}.`
        : 'Write a COMPLETE new test file.';

    return `You are an expert Senior QA Engineer generating Jest unit tests.

${mode}

Rules for your output:
- Output ONLY the FULL updated test file content. NO markdown fences, NO prose explanations, NO diffs.
- Use modern Jest: describe/it/expect + async/await when testing promises.
- import the source module using a relative import: \`import { ... } from '${relImport}'\`;
- Prefer testing exported (public) APIs; do not test private implementation details that aren't exported.
- Cover: happy path, null / undefined / empty inputs, invalid inputs, error cases, async rejection paths, edge-case boundaries.
- For async functions, always test both resolution and rejection (where applicable).
- Use mocking (jest.mock / jest.spyOn) for external dependencies such as fs, network calls, 3rd-party modules.
- Keep tests deterministic. Do not rely on real clocks when avoidable (jest.useFakeTimers if needed).
- Keep each test focused with a clear, descriptive it() name.
- TypeScript: if source is .ts, output TypeScript tests that match the exports (respect types).
- File under test: ${fileName}

Source code under test:
\`\`\`
${sourceContent.slice(0, 18000)}
\`\`\`
`;
};

const buildPytestTask = (fileName: string, existingTests: string, sourceContent: string): string => {
    const base = path.basename(fileName, path.extname(fileName));
    const mode = existingTests
        ? `An existing pytest file already exists. Current contents:
\`\`\`python
${existingTests.slice(0, 8000)}
\`\`\`
UPDATE or EXTEND it. Keep all existing passing tests. ADD new tests only for uncovered scenarios.`
        : 'Write a COMPLETE new pytest file.';

    return `You are an expert Senior QA Engineer generating pytest unit tests.

${mode}

Rules for your output:
- Output ONLY the FULL updated test file content. NO markdown fences, NO prose explanations, NO diffs.
- Import the module under test with a relative-style import: \`from ${base} import ...\` (pick the correct imports).
- Cover: happy path, None / empty inputs, invalid inputs, exception paths using pytest.raises, parameterized edge cases via @pytest.mark.parametrize, async scenarios if any.
- Use pytest fixtures for reusable setup/teardown.
- Mock external side effects (file I/O, HTTP) using monkeypatch or unittest.mock.patch.
- Keep tests deterministic. Do not rely on external services.
- File under test: ${fileName}

Source code under test:
\`\`\`
${sourceContent.slice(0, 18000)}
\`\`\`
`;
};

const buildCTask = (fileName: string, existingTests: string, sourceContent: string): string => {
    const mode = existingTests
        ? `An existing C test file already exists. Current contents:
\`\`\`c
${existingTests.slice(0, 8000)}
\`\`\`
UPDATE or EXTEND it. Keep all existing passing tests. ADD new tests only for uncovered scenarios.`
        : 'Write a COMPLETE new C test file.';

    return `You are an expert Senior QA Engineer generating plain-C unit tests.

${mode}

Rules for your output:
- Output ONLY the FULL updated test file content. NO markdown fences, NO prose explanations, NO diffs.
- Include the source header: \`#include "${path.basename(fileName)}"\`.
- Use a \`main\` function that runs all tests and returns 0 on success or non-zero on failure.
- Use \`assert.h\` for assertions; print a failure message before asserting.
- Cover: happy path, NULL-pointer inputs, empty buffers, invalid ranges, overflow/underflow boundaries.
- Do not rely on external testing libraries.
- File under test: ${fileName}

Source code under test:
\`\`\`
${sourceContent.slice(0, 18000)}
\`\`\`
`;
};

const runPluginAction = async (filePath: string, extraArgs: any[] | undefined): Promise<void> => {
    if (!filePath || !fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    const sourceContent = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const framework = detectFramework(extraArgs, filePath);
    const testFile = resolveTestFile(filePath, framework);
    const existingTests = fs.existsSync(testFile) ? fs.readFileSync(testFile, 'utf8') : '';

    let task = '';
    if (framework === 'jest') task = buildJestTask(fileName, existingTests, sourceContent);
    else if (framework === 'pytest') task = buildPytestTask(fileName, existingTests, sourceContent);
    else task = buildCTask(fileName, existingTests, sourceContent);

    const aiResponse = await consultAgentRouted(AgentRole.QA_ENGINEER, task, '');
    const extractedContent = extractCodeBlock(aiResponse);
    const finalContent = (extractedContent && extractedContent.trim().length > 0 ? extractedContent : aiResponse).trim();

    if (!finalContent) {
        console.warn('Failed to obtain test code from AI response.');
        console.log('AI Response:', aiResponse);
        return;
    }

    if (finalContent.toLowerCase().startsWith('no_change') || finalContent === existingTests.trim()) {
        console.log(`ℹ️ No new test coverage needed; existing ${framework} tests left intact: ${testFile}`);
        return;
    }

    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, finalContent + (finalContent.endsWith('\n') ? '' : '\n'));
    const verb = existingTests ? 'Updated' : 'Generated';
    console.log(`✅ ${verb} tests (${framework}): ${testFile}`);
};

const plugin: OrchestraPlugin = {
    name: 'Test Generator',
    description: 'Generate unit tests for a source file (Jest / pytest / plain C)',
    command: 'test-gen',
    args: [
        { name: 'path', description: 'Source file path to generate tests for', required: true },
        {
            name: 'framework',
            description: 'Test framework: jest | pytest | c (optional, auto-detects by extension)',
            required: false,
        },
    ],
    action: async (...args: any[]): Promise<void> => {
        const filePath = String(args[0] ?? '').trim();
        const extraArgs: any[] = [];
        for (let i = 1; i < args.length; i += 1) if (args[i] !== undefined && args[i] !== null) extraArgs.push(args[i]);
        await runPluginAction(filePath, extraArgs);
    },
};

export default plugin;
