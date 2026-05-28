import path from 'path';
import { getRepoRelPosix } from './docUtils';

export const pickBestDocPathForTopic = (params: {
  repoRoot: string;
  allDocs: string[];
  desiredRel: string;
  match: RegExp;
  canonicalDocsDir?: string;
}): string => {
  const desiredAbs = path.join(params.repoRoot, params.desiredRel);
  if (params.allDocs.includes(desiredAbs)) return desiredAbs;

  const matches = params.allDocs.filter(p => {
    const rel = getRepoRelPosix(params.repoRoot, p);
    return params.match.test(rel) || params.match.test(path.basename(rel));
  });

  if (matches.length === 0) return desiredAbs;

  const canonicalDocsDir = params.canonicalDocsDir || 'docs';
  const score = (absPath: string): number => {
    const rel = getRepoRelPosix(params.repoRoot, absPath);
    const inDocs = rel.startsWith(`${canonicalDocsDir}/`) ? 0 : 1;
    const depth = rel.split('/').length;
    return inDocs * 100 + depth * 10 + rel.length;
  };

  return matches.sort((a, b) => score(a) - score(b))[0];
};

