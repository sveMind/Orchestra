import { OrchestraPlugin } from '../../types';
import { AgentRole, consultAgentRouted } from '../../services/agentService';
import fs from 'fs';
import path from 'path';
import { extractCodeBlock } from '../../utils/codeExtractor';
import { buildMarkdownReport, handleReportOutput } from './reportUtils';
import { runTestFrameworkOrBestEffort, writeTestArtifactSummary, type TestRunSummary } from './runner';
import { detectFrameworkForRepo, languageForFile, type TestFrameworkId } from './frameworkDetect';
import { recordTestGenUsage, readTestGenUsage } from './usageTracker';

type PluginMode = 'report' | 'issue' | 'issues-per-test' | 'comment';

export const generateTests = async (filePath: string): Promise<void> => {
    await plugin.action(filePath);
};

const legacyDetectFramework = (
    extraArgs: any[] | undefined,
    filePath: string
): TestFrameworkId => {
    const ext = path.extname(filePath).toLowerCase();
    const rawFramework = extraArgs && extraArgs[0] ? String(extraArgs[0]).toLowerCase() : '';
    if (rawFramework.includes('py') || rawFramework === 'pytest') return 'pytest';
    if (rawFramework === 'c') return 'c';
    if (rawFramework === 'jest') return 'jest';
    if (rawFramework === 'vitest') return 'vitest';
    if (rawFramework === 'mocha') return 'mocha';
    if (!rawFramework) {
        if (ext === '.py') return 'pytest';
        if (ext === '.c' || ext === '.h') return 'c';
    }
    return 'jest';
};

const resolveTestFile = (originalPath: string, framework: TestFrameworkId): string => {
    const ext = path.extname(originalPath);
    const lowerExt = ext.toLowerCase();
    switch (framework) {
        case 'pytest':
        case 'unittest': {
            const dir = path.dirname(originalPath);
            const base = path.basename(originalPath, ext);
            return path.join(dir, `test_${base}${ext}`);
        }
        case 'c': {
            const dir = path.dirname(originalPath);
            const base = path.basename(originalPath, ext || '.c');
            const finalExt = lowerExt || '.c';
            return path.join(dir, `${base}_test${finalExt}`);
        }
        case 'go': {
            return originalPath.replace(/\.go$/, '_test.go');
        }
        case 'rspec': {
            const dir = path.dirname(originalPath);
            const base = path.basename(originalPath, ext);
            return path.join(dir, `${base}_spec.rb`);
        }
        case 'cargo': {
            const dir = path.dirname(originalPath);
            const base = path.basename(originalPath, ext);
            return path.join(dir, `${base}_tests.rs`);
        }
        case 'phpunit': {
            const dir = path.dirname(originalPath);
            const base = path.basename(originalPath, ext);
            return path.join(dir, `${base}Test.php`);
        }
        case 'junit': {
            const dir = path.dirname(originalPath).replace(/main$/, 'test');
            const base = path.basename(originalPath, ext);
            return path.join(dir, `${base}Test${ext}`);
        }
        case 'dotnet': {
            const dir = path.dirname(originalPath).replace(/\\/g, '/').split('/');
            const testsDir = [...dir.slice(0, -1), 'tests', dir[dir.length - 1] || 'Tests'].join('/');
            try { if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir, { recursive: true }); } catch {}
            return path.join(testsDir, `${path.basename(originalPath, ext)}Tests${ext}`);
        }
        default:
            // jest / vitest / mocha
            return originalPath.replace(ext, `.test${ext}`);
    }
};

const buildJestOrVitestTask = (
    framework: 'jest' | 'vitest',
    fileName: string,
    existingTests: string,
    sourceContent: string
): string => {
    const relImport = `./${path.basename(fileName, path.extname(fileName))}`;
    const mode = existingTests
        ? `An existing test file already exists. Its current contents:
\`\`\`ts
${existingTests.slice(0, 8000)}
\`\`\`

UPDATE or EXTEND the existing test file. Keep all passing describe/it blocks intact. ADD new tests only for uncovered scenarios. DO NOT invent existing tests back if they are gone; instead preserve structure of existing ${/describe\(/.test(existingTests) ? 'describe blocks' : 'tests'}.`
        : 'Write a COMPLETE new test file.';
    const frameworkName = framework === 'vitest' ? 'Vitest' : 'Jest';
    const method = framework === 'vitest' ? 'describe/it/expect + import { describe, it, expect, vi } from "vitest"' : 'describe/it/expect + jest.mock / jest.spyOn';
    return `You are an expert Senior QA Engineer generating ${frameworkName} unit tests.

${mode}

Rules for your output:
- Output ONLY the FULL updated test file content. NO markdown fences, NO prose explanations, NO diffs.
- Use modern ${frameworkName}: ${method}.
- import the source module using a relative import: \`import { ... } from '${relImport}'\`;
- Prefer testing exported (public) APIs; do not test private implementation details that aren't exported.
- Cover: happy path, null / undefined / empty inputs, invalid inputs, error cases, async rejection paths, edge-case boundaries.
- For async functions, always test both resolution and rejection (where applicable).
- Use mocking (${framework === 'vitest' ? 'vi.mock / vi.spyOn' : 'jest.mock / jest.spyOn'}) for external dependencies such as fs, network calls, 3rd-party modules.
- Keep tests deterministic. Do not rely on real clocks when avoidable (${framework === 'vitest' ? 'vi.useFakeTimers' : 'jest.useFakeTimers'} if needed).
- Keep each test focused with a clear, descriptive it() name.
- TypeScript: if source is .ts, output TypeScript tests that match the exports (respect types).
- File under test: ${fileName}

Source code under test:
\`\`\`
${sourceContent.slice(0, 18000)}
\`\`\`
`;
};

const buildMochaTask = (fileName: string, existingTests: string, sourceContent: string): string => {
    const relImport = `./${path.basename(fileName, path.extname(fileName))}`;
    const mode = existingTests
        ? `An existing test file exists. Current contents:
\`\`\`js
${existingTests.slice(0, 8000)}
\`\`\`

UPDATE/extend only; keep passing tests.` : 'Write a COMPLETE new mocha test file.';
    return `You are an expert Senior QA Engineer generating Mocha/Chai tests.
${mode}

Rules:
- Output ONLY the FULL updated test file content. NO markdown fences, NO prose explanations.
- Use describe/it + chai expect + sinon for mocking.
- Import source with: \`const { ... } = require('${relImport}');\` (or import).
- Cover happy path, invalid inputs, errors, async resolve/reject.
- File: ${fileName}

Source:
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

const buildGoTestTask = (fileName: string, existingTests: string, sourceContent: string): string => {
    const mode = existingTests
        ? `An existing go test file exists. Current contents:
\`\`\`go
${existingTests.slice(0, 8000)}
\`\`\`

Extend only; keep passing tests.`
        : 'Write a COMPLETE new Go test file.';
    const pkgGuess = /^package\s+(\w+)/m.exec(sourceContent);
    const pkg = pkgGuess ? pkgGuess[1] : 'pkg';
    return `You are an expert Senior QA Engineer generating Go tests.
${mode}

Rules:
- Output ONLY the full updated test file content. NO prose / NO fences.
- Declare package as \`package ${pkg}\`; import \`testing\`.
- Use \`func TestXxx(t *testing.T)\` + subtests \`t.Run\` for table-driven tests.
- Cover happy path + edge cases. Use t.Errorf to report failures.
- Keep tests deterministic.
- File: ${fileName}

Source:
\`\`\`
${sourceContent.slice(0, 18000)}
\`\`\`
`;
};

const buildCargoTestTask = (fileName: string, existingTests: string, sourceContent: string): string => {
    const mode = existingTests
        ? `An existing Rust tests module exists. Current:
\`\`\`rust
${existingTests.slice(0, 8000)}
\`\`\`

Extend only, keep passing tests.`
        : 'Write a COMPLETE new tests module or separate tests file.';
    return `You are an expert Senior QA Engineer generating Cargo (Rust) tests.
${mode}

Rules:
- Output ONLY the FULL updated test file/section. NO prose, NO fences.
- Use \`# [cfg(test)]\` module tests or a tests/ file. \`use super::*;\`.
- Use \`# [test]\` + \`assert_eq!/assert_ne!/assert!\`.
- Cover happy path, None / Err paths, edge boundaries.
- File: ${fileName}

Source:
\`\`\`
${sourceContent.slice(0, 18000)}
\`\`\`
`;
};

const buildRspecTask = (fileName: string, existingTests: string, sourceContent: string): string => {
    const mode = existingTests
        ? `An existing RSpec spec exists. Current:
\`\`\`ruby
${existingTests.slice(0, 8000)}
\`\`\`
Extend only; keep passing specs.`
        : 'Write a COMPLETE new RSpec spec.';
    return `You are an expert Senior QA Engineer generating RSpec specs.
${mode}

Rules:
- Output ONLY the full spec content. NO prose/NO fences.
- Use \`RSpec.describe ... do\` / \`context\` / \`it\` / \`expect\`.
- Cover happy path, nil/empty, invalid params, exception paths with raise_error.
- Use \`let\` / \`before\` for shared setup. Stub HTTP/filesystem with WebMock / allow(File).to receive(...) etc.
- File: ${fileName}

Source:
\`\`\`
${sourceContent.slice(0, 18000)}
\`\`\`
`;
};

const buildPHPUnitTask = (fileName: string, existingTests: string, sourceContent: string): string => {
    const mode = existingTests
        ? `An existing PHPUnit file exists. Current:
\`\`\`php
${existingTests.slice(0, 8000)}
\`\`\`
Extend only; keep passing tests.`
        : 'Write a COMPLETE new PHPUnit test file.';
    return `You are an expert Senior QA Engineer generating PHPUnit tests.
${mode}

Rules:
- Output ONLY the full updated PHPUnit test file content (opening <?php tag + class). NO prose.
- Extend PHPUnit\\Framework\\TestCase. Use testPhpMethod names prefixed test*.
- Use assertions assertEquals/assertTrue/assertNull/assertException/assertCount etc.
- Cover happy path, invalid/null, exception paths.
- File: ${fileName}

Source:
\`\`\`
${sourceContent.slice(0, 18000)}
\`\`\`
`;
};

const buildJUnitTask = (fileName: string, existingTests: string, sourceContent: string): string => {
    const mode = existingTests
        ? `An existing JUnit test class exists. Current:
\`\`\`java
${existingTests.slice(0, 8000)}
\`\`\`
Extend only; keep passing tests.`
        : 'Write a COMPLETE new JUnit test class.';
    return `You are an expert Senior QA Engineer generating JUnit 5 tests (Java/Kotlin).
${mode}

Rules:
- Output ONLY the full updated class. NO prose/NO fences.
- Use org.junit.jupiter.api.Test; import static org.junit.jupiter.api.Assertions.*;
- Use descriptive test method names. Cover happy path, null/empty, invalid inputs, exception paths with assertThrows.
- Keep tests deterministic.
- File: ${fileName}

Source:
\`\`\`
${sourceContent.slice(0, 18000)}
\`\`\`
`;
};

const buildDotNetTask = (fileName: string, existingTests: string, sourceContent: string): string => {
    const mode = existingTests
        ? `An existing xUnit/NUnit test class exists. Current:
\`\`\`cs
${existingTests.slice(0, 8000)}
\`\`\`
Extend only, keep passing tests.`
        : 'Write a COMPLETE new xUnit test class.';
    return `You are an expert Senior QA Engineer generating .NET xUnit tests in C#.
${mode}

Rules:
- Output ONLY the full updated test class. NO prose/NO fences.
- Use [Fact] / [Theory] with InlineData. Use Xunit.Assert.*.
- Cover happy path, null/empty, invalid inputs, exception paths with Assert.Throws<>.
- Keep tests deterministic.
- File: ${fileName}

Source:
\`\`\`
${sourceContent.slice(0, 18000)}
\`\`\`
`;
};

const buildPromptForFramework = (
    framework: TestFrameworkId,
    fileName: string,
    existingTests: string,
    sourceContent: string
): string => {
    switch (framework) {
        case 'jest': return buildJestOrVitestTask('jest', fileName, existingTests, sourceContent);
        case 'vitest': return buildJestOrVitestTask('vitest', fileName, existingTests, sourceContent);
        case 'mocha': return buildMochaTask(fileName, existingTests, sourceContent);
        case 'pytest':
        case 'unittest': return buildPytestTask(fileName, existingTests, sourceContent);
        case 'c': return buildCTask(fileName, existingTests, sourceContent);
        case 'go': return buildGoTestTask(fileName, existingTests, sourceContent);
        case 'cargo': return buildCargoTestTask(fileName, existingTests, sourceContent);
        case 'rspec': return buildRspecTask(fileName, existingTests, sourceContent);
        case 'phpunit': return buildPHPUnitTask(fileName, existingTests, sourceContent);
        case 'junit': return buildJUnitTask(fileName, existingTests, sourceContent);
        case 'dotnet': return buildDotNetTask(fileName, existingTests, sourceContent);
        default: return buildJestOrVitestTask('jest', fileName, existingTests, sourceContent);
    }
};

type GenerationResult = { testFile: string; framework: TestFrameworkId; generated: boolean; updated: boolean; writtenLines: number };

const generateTestsForFile = async (
    filePath: string,
    frameworkHint?: string
): Promise<GenerationResult | null> => {
    if (!filePath || !fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return null;
    }
    const sourceContent = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const language = languageForFile(filePath);
    const repoGuess = findRepoRoot(filePath);
    const autoDetect = detectFrameworkForRepo(repoGuess, filePath);
    const framework: TestFrameworkId =
        (frameworkHint && (['jest','vitest','mocha','pytest','unittest','go','cargo','rspec','junit','phpunit','dotnet','c'].includes(frameworkHint.toLowerCase())
            ? frameworkHint.toLowerCase() as TestFrameworkId
            : legacyDetectFramework(frameworkHint ? [frameworkHint] : undefined, filePath) as TestFrameworkId))
        || autoDetect.framework as TestFrameworkId;
    void language;
    const testFile = resolveTestFile(filePath, framework);
    const existingTests = fs.existsSync(testFile) ? fs.readFileSync(testFile, 'utf8') : '';
    const task = buildPromptForFramework(framework, fileName, existingTests, sourceContent);
    const aiResponse = await consultAgentRouted(AgentRole.QA_ENGINEER, task, '');
    const extractedContent = extractCodeBlock(aiResponse);
    const finalContent = (extractedContent && extractedContent.trim().length > 0 ? extractedContent : aiResponse).trim();
    if (!finalContent) {
        console.warn('Failed to obtain test code from AI response.');
        console.log('AI Response:', aiResponse);
        return null;
    }
    if (finalContent.toLowerCase().startsWith('no_change') || finalContent === existingTests.trim()) {
        console.log(`ℹ️  No new test coverage needed; existing ${framework} tests left intact: ${testFile}`);
        return { testFile, framework, generated: false, updated: false, writtenLines: 0 };
    }
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, finalContent + (finalContent.endsWith('\n') ? '' : '\n'));
    const wasUpdate = !!existingTests;
    console.log(`✅ ${wasUpdate ? 'Updated' : 'Generated'} tests (${framework}): ${testFile}`);
    return { testFile, framework, generated: !wasUpdate, updated: wasUpdate, writtenLines: finalContent.split(/\n/).length };
};

const findRepoRoot = (fromPath: string): string => {
    let cur = path.isAbsolute(fromPath) ? fromPath : path.resolve(fromPath);
    if (!fs.existsSync(cur) || !fs.statSync(cur).isDirectory()) cur = path.dirname(cur);
    for (let i = 0; i < 12; i++) {
        if (fs.existsSync(path.join(cur, 'package.json')) || fs.existsSync(path.join(cur, 'go.mod')) || fs.existsSync(path.join(cur, 'Cargo.toml')) || fs.existsSync(path.join(cur, 'pyproject.toml')) || fs.existsSync(path.join(cur, 'Gemfile')) || fs.existsSync(path.join(cur, 'composer.json')) || fs.existsSync(path.join(cur, '.git'))) return cur;
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
    }
    return process.cwd();
};

const extractMode = (args: any[] | undefined): PluginMode => {
    if (!args || args.length === 0) return 'report';
    for (const a of args) {
        const s = String(a || '').toLowerCase();
        if (s === 'report' || s === 'issue' || s === 'issues-per-test' || s === 'comment') return s as PluginMode;
    }
    return 'report';
};

const extractFrameworkHint = (args: any[] | undefined): string | undefined => {
    if (!args) return undefined;
    const allowed = ['jest','vitest','mocha','pytest','unittest','go','cargo','rspec','junit','phpunit','dotnet','c'];
    for (const a of args) {
        const s = String(a || '').toLowerCase();
        if (allowed.includes(s)) return s;
    }
    return undefined;
};

const extractOptions = (args: any[] | undefined): { dryRun: boolean; noRun: boolean; timeoutMs: number } => {
    const opts = { dryRun: false, noRun: false, timeoutMs: 120_000 };
    if (!args) return opts;
    for (const a of args) {
        const s = String(a || '');
        if (s === '--dry-run' || s === '--skip-run') opts.dryRun = true;
        if (s === '--no-run') opts.noRun = true;
        if (s.startsWith('--timeout=')) {
            const n = parseInt(s.slice('--timeout='.length), 10);
            if (!Number.isNaN(n) && n > 0) opts.timeoutMs = n * 1000;
        }
        if (s.startsWith('--timeout-ms=')) {
            const n = parseInt(s.slice('--timeout-ms='.length), 10);
            if (!Number.isNaN(n) && n > 0) opts.timeoutMs = n;
        }
    }
    return opts;
};

const runPluginAction = async (filePath: string | undefined, extraArgs: any[] | undefined): Promise<void> => {
    const mode = extractMode(extraArgs);
    const frameworkHint = extractFrameworkHint(extraArgs);
    const opts = extractOptions(extraArgs);

    // If filePath is not a real file, treat it as optional and fall back to repoRoot.
    const targetFile = filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? path.resolve(filePath) : null;
    const repoRoot = filePath
        ? (fs.existsSync(filePath) ? (fs.statSync(filePath).isDirectory() ? path.resolve(filePath) : findRepoRoot(filePath)) : process.cwd())
        : process.cwd();

    // Generate tests for the target file (if supplied). When a directory is the input, we don't run
    // AI generation against every file — that would be expensive. Instead we still run the detected
    // test suite against the existing tests so the "report / issue / comment" modes are still useful
    // on whole-repo runs.
    let genResult: GenerationResult | null = null;
    if (targetFile) {
        genResult = await generateTestsForFile(targetFile, frameworkHint);
    }

    const detection = detectFrameworkForRepo(repoRoot, targetFile || undefined);
    const frameworkActual = (frameworkHint as TestFrameworkId | undefined) || detection.framework;
    const detActual = frameworkHint && frameworkActual !== detection.framework
        ? { ...detection, framework: frameworkActual, language: targetFile ? languageForFile(targetFile) : detection.language, evidence: [...detection.evidence, `override --framework=${frameworkHint}`], runnerBin: detection.runnerBin, runnerArgsTemplate: detection.runnerArgsTemplate, reporterArgsForJson: detection.reporterArgsForJson, reporterArgsForJunit: detection.reporterArgsForJunit, testGlob: detection.testGlob, configFile: detection.configFile, jsonOutputType: detection.jsonOutputType }
        : detection;

    let runnerSummary: TestRunSummary;
    try {
        runnerSummary = opts.noRun
            ? emptyRunnerSummary(repoRoot, targetFile, detActual)
            : await runTestFrameworkOrBestEffort(repoRoot, targetFile, detActual, { dryRun: opts.dryRun, timeoutMs: opts.timeoutMs });
    } catch (err) {
        console.log(`⚠️  Test runner failed (continuing with report mode): ${err instanceof Error ? err.message : String(err)}`);
        runnerSummary = emptyRunnerSummary(repoRoot, targetFile, detActual);
        runnerSummary.errors.push(`runner invoke catch-all: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Annotate testsGenerated = number of new test files we created / 1 per target; approximate line-count sanity
    runnerSummary.testsGenerated = genResult ? (genResult.generated || genResult.updated ? Math.max(1, Math.round(genResult.writtenLines / 5)) : 0) : 0;
    if (genResult?.framework) runnerSummary.framework = genResult.framework;
    // Mark any finding whose testFilePath matches the generated test file as "generatedByTestGen".
    if (genResult) {
        const genRel = toRepoRel(genResult.testFile, repoRoot);
        for (const f of runnerSummary.findings) {
            if (String(f.testFilePath).endsWith(genRel) || String(f.testFilePath).endsWith(path.basename(genRel))) f.generatedByTestGen = true;
        }
    }

    const artifactPath = writeTestArtifactSummary(repoRoot, runnerSummary);
    console.log(`🧪 Machine-readable results written to: ${artifactPath}`);

    const usage = recordTestGenUsage(repoRoot, {
        target: targetFile ? path.relative(repoRoot, targetFile) : null,
        mode,
        framework: runnerSummary.framework,
        frameworkConfidence: runnerSummary.frameworkConfidence,
        testsGenerated: runnerSummary.testsGenerated,
        testsDiscovered: runnerSummary.testsDiscovered,
        passed: runnerSummary.testsPassed,
        failed: runnerSummary.testsFailed,
        errored: runnerSummary.testsErrored,
        skipped: runnerSummary.testsSkipped,
        unknown: runnerSummary.unknown,
        totalDurationMs: runnerSummary.totalDurationMs,
        errors: runnerSummary.errors.length,
        options: { dryRun: opts.dryRun, noRun: opts.noRun, timeoutMs: opts.timeoutMs }
    });
    console.log(`📜 Usage history entries: ${usage.totalRuns} (last updated ${usage.lastUpdated})`);

    const report = buildMarkdownReport(runnerSummary);
    const hasIssues = runnerSummary.testsFailed > 0 || runnerSummary.testsErrored > 0;

    const umbTitle = `Orchestra Test Report — ${runnerSummary.framework} · ${runnerSummary.testsFailed}/${runnerSummary.testsDiscovered || 0} failing`;
    await handleReportOutput({
        dirPath: repoRoot,
        mode,
        report,
        hasIssues,
        reportFileName: 'TEST_REPORT.md',
        issueTitle: umbTitle,
        issueLabels: ['orchestra', 'auto-scan', 'test-gen'],
        prCommentHeader: `### 🧪 Orchestra Test Report (mode=${mode})\n`,
        successMessage: 'Test-gen run complete. Report written',
        findings: runnerSummary.findings,
        summary: runnerSummary
    });
};

const toRepoRel = (absOrLike: string, repoRoot: string): string => {
    if (!absOrLike) return '';
    try { if (path.isAbsolute(absOrLike)) return path.relative(repoRoot, absOrLike).split(path.sep).join('/'); } catch {}
    return String(absOrLike).split(path.sep).join('/');
};

const emptyRunnerSummary = (repoRoot: string, target: string | null, det: ReturnType<typeof detectFrameworkForRepo>): TestRunSummary => ({
    generatedAt: new Date().toISOString(),
    repoRoot,
    target,
    framework: det.framework,
    frameworkConfidence: det.confidence,
    evidence: det.evidence,
    invocations: [],
    testsGenerated: 0,
    testsDiscovered: 0,
    testsPassed: 0,
    testsFailed: 0,
    testsSkipped: 0,
    testsErrored: 0,
    unknown: 0,
    totalDurationMs: 0,
    findings: [],
    errors: ['runner invoked with --no-run; skipping execution']
});

export { readTestGenUsage, buildMarkdownReport, writeTestArtifactSummary, detectFrameworkForRepo };

const plugin: OrchestraPlugin = {
    name: 'Test Generator',
    description: 'Generate + run tests (jest/vitest/mocha/pytest/go/cargo/rspec/junit/phpunit/dotnet/plain-C), write TEST_REPORT.md, and manage per-test VCS issues with auto-close.',
    command: 'test-gen',
    args: [
        { name: 'path', description: 'Source file or directory to generate tests for / run suite against (default: current directory)', required: false },
        { name: 'framework', description: 'jest | vitest | mocha | pytest | unittest | go | cargo | rspec | junit | phpunit | dotnet | c (optional, auto-detects via repo manifests)', required: false },
        { name: 'mode', description: 'report | issue | issues-per-test | comment (default: report)', required: false },
        { name: 'options', description: '--dry-run --no-run --timeout=60 --timeout-ms=120000', required: false }
    ],
    action: async (...args: any[]): Promise<void> => {
        const filePath = args[0] && typeof args[0] === 'string' ? args[0] : undefined;
        const extraArgs: any[] = [];
        for (let i = 1; i < args.length; i += 1) if (args[i] !== undefined && args[i] !== null) extraArgs.push(args[i]);
        await runPluginAction(filePath, extraArgs);
    },
};

export default plugin;

