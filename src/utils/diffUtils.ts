export const parseUnifiedDiffByFile = (diff: string): { changedFiles: string[]; diffsByFile: Map<string, string> } => {
  const lines = String(diff || '').split('\n');
  const diffsByFile = new Map<string, string>();
  const changedFiles: string[] = [];

  let currentFile: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentFile) return;
    const content = buffer.join('\n').trim();
    if (content) diffsByFile.set(currentFile, content);
    currentFile = null;
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      flush();
      currentFile = match[2];
      changedFiles.push(currentFile);
      buffer.push(line);
      continue;
    }

    if (currentFile) buffer.push(line);
  }

  flush();
  return { changedFiles, diffsByFile };
};

