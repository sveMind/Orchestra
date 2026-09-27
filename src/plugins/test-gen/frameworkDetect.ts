import fs from 'fs';
import path from 'path';

export type TestFrameworkId =
  | 'jest'
  | 'vitest'
  | 'mocha'
  | 'pytest'
  | 'unittest'
  | 'cargo'
  | 'go'
  | 'rspec'
  | 'junit'
  | 'phpunit'
  | 'dotnet'
  | 'c';

export type LanguageId = 'ts' | 'js' | 'py' | 'rs' | 'go' | 'rb' | 'java' | 'kt' | 'cs' | 'php' | 'c' | 'cpp' | 'unknown';

export type FrameworkAutoDetect = {
  framework: TestFrameworkId;
  language: LanguageId;
  confidence: number;
  evidence: string[];
  runnerBin: string;
  runnerArgsTemplate: string[];
  reporterArgsForJson: string[];
  reporterArgsForJunit: string[];
  testGlob: string;
  configFile: string | null;
  jsonOutputType: 'jest' | 'vitest' | 'tap' | 'junit' | 'gotest' | 'cargo' | 'pytest' | 'generic';
};

const hasFile = (root: string, relative: string): boolean => {
  try { return fs.existsSync(path.join(root, relative)); } catch { return false; }
};

const hasScriptInPackageJson = (root: string, keyContains: string, cmdContains?: string): string | null => {
  const p = path.join(root, 'package.json');
  try {
    if (!fs.existsSync(p)) return null;
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const scripts = pkg && pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts as Record<string, unknown> : {};
    for (const [k, v] of Object.entries(scripts)) {
      if (String(k).toLowerCase().includes(keyContains.toLowerCase())) {
        if (cmdContains) {
          if (typeof v === 'string' && v.toLowerCase().includes(cmdContains.toLowerCase())) return k;
        } else return k;
      }
      if (cmdContains && typeof v === 'string' && v.toLowerCase().includes(cmdContains.toLowerCase())) return k;
    }
    const devDeps = pkg.devDependencies || {};
    const deps = pkg.dependencies || {};
    if (Object.keys(devDeps).some(d => d.toLowerCase().includes(keyContains.toLowerCase()))) return `devDep:${keyContains}`;
    if (Object.keys(deps).some(d => d.toLowerCase().includes(keyContains.toLowerCase()))) return `dep:${keyContains}`;
  } catch {}
  return null;
};

const pyproject = (root: string): any => {
  try {
    const p = path.join(root, 'pyproject.toml');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  } catch { return ''; }
};

export const detectFrameworkForRepo = (repoRoot: string, targetFilePath?: string | null): FrameworkAutoDetect => {
  const evidence: string[] = [];
  const ext = targetFilePath ? path.extname(targetFilePath).toLowerCase().replace(/^\./, '') : '';

  // Node.js families
  const hasPkg = hasFile(repoRoot, 'package.json');
  if (hasPkg) {
    const vitestScript = hasScriptInPackageJson(repoRoot, 'vitest');
    const jestScript = hasScriptInPackageJson(repoRoot, 'jest');
    const mochaScript = hasScriptInPackageJson(repoRoot, 'mocha');
    if (vitestScript || hasFile(repoRoot, 'vitest.config.ts') || hasFile(repoRoot, 'vitest.config.js') || hasFile(repoRoot, 'vite.config.ts') || hasFile(repoRoot, 'vite.config.js')) {
      evidence.push('package.json exists');
      if (vitestScript) evidence.push(`npm script / dep match: ${vitestScript}`);
      if (hasFile(repoRoot, 'vitest.config.ts')) evidence.push('vitest.config.ts present');
      return {
        framework: 'vitest', language: (ext === 'js' ? 'js' : 'ts'), confidence: 0.92, evidence,
        runnerBin: 'npx', runnerArgsTemplate: ['vitest', 'run', '--no-coverage'],
        reporterArgsForJson: ['--reporter=verbose', '--reporter=json'],
        reporterArgsForJunit: ['--reporter=junit'],
        testGlob: '**/*.{test,spec}.{ts,tsx,js,jsx}',
        configFile: hasFile(repoRoot, 'vitest.config.ts') ? 'vitest.config.ts' : hasFile(repoRoot, 'vitest.config.js') ? 'vitest.config.js' : null,
        jsonOutputType: 'vitest'
      };
    }
    if (jestScript || hasFile(repoRoot, 'jest.config.ts') || hasFile(repoRoot, 'jest.config.js') || hasFile(repoRoot, 'jest.config.json')) {
      evidence.push('package.json exists');
      if (jestScript) evidence.push(`npm script / dep match: ${jestScript}`);
      return {
        framework: 'jest', language: (ext === 'js' ? 'js' : 'ts'), confidence: 0.95, evidence,
        runnerBin: 'npx', runnerArgsTemplate: ['jest', '--runInBand'],
        reporterArgsForJson: ['--json', '--outputFile=.orchestra/jest-results.json'],
        reporterArgsForJunit: ['--reporters=jest-junit'],
        testGlob: '**/*.{test,spec}.{ts,tsx,js,jsx}',
        configFile: hasFile(repoRoot, 'jest.config.ts') ? 'jest.config.ts' : hasFile(repoRoot, 'jest.config.js') ? 'jest.config.js' : 'jest.config.json',
        jsonOutputType: 'jest'
      };
    }
    if (mochaScript) {
      evidence.push(`npm script / devDep: ${mochaScript}`);
      return {
        framework: 'mocha', language: (ext === 'js' ? 'js' : 'ts'), confidence: 0.78, evidence,
        runnerBin: 'npx', runnerArgsTemplate: ['mocha'],
        reporterArgsForJson: ['--reporter=json'],
        reporterArgsForJunit: ['--reporter=mocha-junit-reporter'],
        testGlob: 'test/**/*.{js,ts}',
        configFile: hasFile(repoRoot, '.mocharc.js') ? '.mocharc.js' : null,
        jsonOutputType: 'jest'
      };
    }
  }

  // Python
  const pyText = pyproject(repoRoot);
  const isPytest = hasFile(repoRoot, 'pytest.ini') || hasFile(repoRoot, 'tox.ini') || hasFile(repoRoot, 'setup.cfg')
    || pyText.includes('[tool.pytest') || pyText.includes('pytest')
    || hasFile(repoRoot, 'tests/__init__.py')
    || /test_.*\.py$/.test(targetFilePath || '') || /.*_test\.py$/.test(targetFilePath || '');
  if (isPytest || ext === 'py') {
    if (isPytest) evidence.push('pytest.ini/tox.ini/pyproject tool.pytest/tests/__init__.py present');
    if (ext === 'py') evidence.push('target .py file');
    return {
      framework: 'pytest', language: 'py', confidence: isPytest ? 0.93 : 0.7, evidence,
      runnerBin: 'python3', runnerArgsTemplate: ['-m', 'pytest'],
      reporterArgsForJson: ['--report=.orchestra/pytest-report.json', '--json=.orchestra/pytest.json', '-v'],
      reporterArgsForJunit: ['--junitxml=.orchestra/pytest-junit.xml'],
      testGlob: 'tests/**/test_*.py',
      configFile: hasFile(repoRoot, 'pytest.ini') ? 'pytest.ini' : hasFile(repoRoot, 'pyproject.toml') ? 'pyproject.toml' : null,
      jsonOutputType: 'pytest'
    };
  }

  // Go
  if (hasFile(repoRoot, 'go.mod') || ext === 'go') {
    evidence.push(hasFile(repoRoot, 'go.mod') ? 'go.mod present' : 'target .go file');
    return {
      framework: 'go', language: 'go', confidence: 0.95, evidence,
      runnerBin: 'go', runnerArgsTemplate: ['test', './...'],
      reporterArgsForJson: ['-json'],
      reporterArgsForJunit: [],
      testGlob: '**/*_test.go',
      configFile: 'go.mod',
      jsonOutputType: 'gotest'
    };
  }

  // Rust / Cargo
  if (hasFile(repoRoot, 'Cargo.toml') || ext === 'rs') {
    evidence.push(hasFile(repoRoot, 'Cargo.toml') ? 'Cargo.toml present' : 'target .rs file');
    return {
      framework: 'cargo', language: 'rs', confidence: 0.97, evidence,
      runnerBin: 'cargo', runnerArgsTemplate: ['test'],
      reporterArgsForJson: ['--', '--format', 'json', '-Zunstable-options'],
      reporterArgsForJunit: [],
      testGlob: 'tests/**/*.rs + src/**/#[cfg(test)]',
      configFile: 'Cargo.toml',
      jsonOutputType: 'cargo'
    };
  }

  // Ruby / RSpec
  if (hasFile(repoRoot, 'Gemfile') || hasFile(repoRoot, 'spec') || ext === 'rb') {
    if (hasFile(repoRoot, 'Gemfile')) evidence.push('Gemfile present');
    if (hasFile(repoRoot, 'spec')) evidence.push('spec/ directory present');
    return {
      framework: 'rspec', language: 'rb', confidence: 0.9, evidence,
      runnerBin: 'bundle', runnerArgsTemplate: ['exec', 'rspec'],
      reporterArgsForJson: ['--format', 'json', '--out', '.orchestra/rspec.json'],
      reporterArgsForJunit: ['--format', 'RspecJunitFormatter', '--out', '.orchestra/rspec-junit.xml'],
      testGlob: 'spec/**/*_spec.rb',
      configFile: hasFile(repoRoot, '.rspec') ? '.rspec' : 'Gemfile',
      jsonOutputType: 'generic'
    };
  }

  // PHP / PHPUnit
  if (hasFile(repoRoot, 'composer.json') || hasFile(repoRoot, 'phpunit.xml') || hasFile(repoRoot, 'phpunit.xml.dist') || ext === 'php') {
    if (hasFile(repoRoot, 'composer.json')) evidence.push('composer.json present');
    if (hasFile(repoRoot, 'phpunit.xml')) evidence.push('phpunit.xml present');
    return {
      framework: 'phpunit', language: 'php', confidence: 0.9, evidence,
      runnerBin: 'vendor/bin/phpunit', runnerArgsTemplate: [],
      reporterArgsForJson: ['--log-json=.orchestra/phpunit.json'],
      reporterArgsForJunit: ['--log-junit=.orchestra/phpunit-junit.xml'],
      testGlob: 'tests/**/*Test.php',
      configFile: hasFile(repoRoot, 'phpunit.xml.dist') ? 'phpunit.xml.dist' : 'phpunit.xml',
      jsonOutputType: 'generic'
    };
  }

  // .NET
  const csProj = hasGlobAny(repoRoot, '*.csproj');
  if (csProj || ext === 'cs') {
    if (csProj) evidence.push(`csproj present: ${csProj}`);
    return {
      framework: 'dotnet', language: 'cs', confidence: 0.9, evidence,
      runnerBin: 'dotnet', runnerArgsTemplate: ['test'],
      reporterArgsForJson: ['--logger', 'trx;LogFileName=.orchestra/dotnet-test.trx'],
      reporterArgsForJunit: [],
      testGlob: 'tests/**/*.cs',
      configFile: csProj,
      jsonOutputType: 'junit'
    };
  }

  // Java JUnit
  if (hasFile(repoRoot, 'pom.xml') || hasFile(repoRoot, 'build.gradle') || hasFile(repoRoot, 'build.gradle.kts') || ext === 'java' || ext === 'kt') {
    evidence.push(hasFile(repoRoot, 'pom.xml') ? 'pom.xml present' : hasFile(repoRoot, 'build.gradle') ? 'build.gradle present' : 'target java/kt file');
    return {
      framework: 'junit', language: ext === 'kt' ? 'kt' : 'java', confidence: 0.88, evidence,
      runnerBin: hasFile(repoRoot, 'pom.xml') ? 'mvn' : 'gradle',
      runnerArgsTemplate: hasFile(repoRoot, 'pom.xml') ? ['test'] : ['test'],
      reporterArgsForJson: [],
      reporterArgsForJunit: hasFile(repoRoot, 'pom.xml') ? [] : [],
      testGlob: 'src/test/**/*.{java,kt}',
      configFile: hasFile(repoRoot, 'pom.xml') ? 'pom.xml' : hasFile(repoRoot, 'build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle',
      jsonOutputType: 'junit'
    };
  }

  // Fallback: plain C assert.h test
  if (targetFilePath && (ext === 'c' || ext === 'h' || ext === 'cpp')) {
    evidence.push(`target C/C++ source: ${path.basename(targetFilePath)}`);
    return {
      framework: 'c', language: ext === 'cpp' ? 'cpp' : 'c', confidence: 0.65, evidence,
      runnerBin: 'cc', runnerArgsTemplate: [], reporterArgsForJson: [], reporterArgsForJunit: [],
      testGlob: '*_test.c',
      configFile: null,
      jsonOutputType: 'generic'
    };
  }

  // Last-resort fallback: Jest by default matches the existing legacy behavior
  evidence.push('no firm evidence; falling back to Jest');
  return {
    framework: 'jest', language: 'ts', confidence: 0.3, evidence,
    runnerBin: 'npx', runnerArgsTemplate: ['jest', '--runInBand'],
    reporterArgsForJson: ['--json', '--outputFile=.orchestra/jest-results.json'],
    reporterArgsForJunit: ['--reporters=jest-junit'],
    testGlob: '**/*.{test,spec}.{ts,tsx,js,jsx}',
    configFile: hasPkg ? 'package.json' : null,
    jsonOutputType: 'jest'
  };
};

const hasGlobAny = (root: string, pattern: string): string | null => {
  if (!pattern.includes('*')) return hasFile(root, pattern) ? pattern : null;
  try {
    const entries = fs.readdirSync(root);
    const suffix = pattern.replace(/^\*+/, '');
    const match = entries.find(e => e.toLowerCase().endsWith(suffix.toLowerCase()));
    return match || null;
  } catch { return null; }
};

export const languageForFile = (filePath: string): LanguageId => {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
  switch (ext) {
    case 'ts':
    case 'tsx': return 'ts';
    case 'js':
    case 'jsx':
    case 'cjs':
    case 'mjs': return 'js';
    case 'py': return 'py';
    case 'rs': return 'rs';
    case 'go': return 'go';
    case 'rb': return 'rb';
    case 'java': return 'java';
    case 'kt':
    case 'kts': return 'kt';
    case 'cs': return 'cs';
    case 'php': return 'php';
    case 'c':
    case 'h': return 'c';
    case 'cpp':
    case 'cxx':
    case 'hpp':
    case 'cc': return 'cpp';
    default: return 'unknown';
  }
};
