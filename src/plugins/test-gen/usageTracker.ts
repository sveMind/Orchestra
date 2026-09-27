import fs from 'fs';
import path from 'path';

export type TestGenUsageEntry = {
  timestamp: string;
  target: string | null;
  mode: string;
  framework: string;
  frameworkConfidence: number;
  testsGenerated: number;
  testsDiscovered: number;
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
  unknown: number;
  totalDurationMs: number;
  errors: number;
  options: Record<string, unknown>;
};

export type TestGenUsageFile = {
  totalRuns: number;
  lastUpdated: string;
  history: TestGenUsageEntry[];
};

const statePath = (repoRoot: string): string => path.join(repoRoot, '.orchestra', 'test-gen-usage.json');

export const readTestGenUsage = (repoRoot: string): TestGenUsageFile => {
  try {
    const p = statePath(repoRoot);
    if (!fs.existsSync(p)) return emptyState();
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data || typeof data !== 'object') return emptyState();
    return { ...emptyState(), ...data, history: Array.isArray(data.history) ? data.history.slice() : [] };
  } catch {
    return emptyState();
  }
};

export const recordTestGenUsage = (repoRoot: string, entry: Omit<TestGenUsageEntry, 'timestamp'>): TestGenUsageFile => {
  const current = readTestGenUsage(repoRoot);
  const enriched: TestGenUsageEntry = { ...entry, timestamp: new Date().toISOString() };
  current.history.unshift(enriched);
  if (current.history.length > 200) current.history.length = 200;
  current.totalRuns = (current.totalRuns || 0) + 1;
  current.lastUpdated = enriched.timestamp;
  try {
    const p = statePath(repoRoot);
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(current, null, 2) + '\n');
  } catch {}
  return current;
};

const emptyState = (): TestGenUsageFile => ({ totalRuns: 0, lastUpdated: new Date().toISOString(), history: [] });
