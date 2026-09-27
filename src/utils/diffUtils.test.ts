import { parseUnifiedDiffByFile } from './diffUtils';

describe('parseUnifiedDiffByFile', () => {
  test('handles empty input gracefully', () => {
    const r = parseUnifiedDiffByFile('');
    expect(r.changedFiles).toEqual([]);
    expect(r.diffsByFile.size).toBe(0);
  });

  test('handles nullish input safely', () => {
    const r = parseUnifiedDiffByFile(null as any);
    expect(r.changedFiles).toEqual([]);
  });

  test('parses single file diff', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
index aaaa..bbbb 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,3 @@
-const a = 1;
+const a = 2;
 const b = 3;
`;
    const r = parseUnifiedDiffByFile(diff);
    expect(r.changedFiles).toEqual(['src/foo.ts']);
    expect(r.diffsByFile.has('src/foo.ts')).toBe(true);
    expect(r.diffsByFile.get('src/foo.ts')).toContain('+const a = 2;');
  });

  test('parses multi-file diff', () => {
    const diff = `diff --git a/a.md b/a.md
index 111..222 100644
--- a/a.md
+++ b/a.md
@@ -1 +1 @@
-old content
+new content
diff --git a/b.js b/b.js
index 333..444 100644
--- a/b.js
+++ b/b.js
@@ -1 +1 @@
-var x = 1;
+var x = 42;
`;
    const r = parseUnifiedDiffByFile(diff);
    expect(r.changedFiles).toEqual(['a.md', 'b.js']);
    expect(r.diffsByFile.size).toBe(2);
    expect(r.diffsByFile.get('a.md')).toContain('new content');
    expect(r.diffsByFile.get('b.js')).toContain('var x = 42;');
  });

  test('uses the "b/" filename from diff header', () => {
    const diff = `diff --git a/old.name b/new.name
--- a/old.name
+++ b/new.name
@@ -1 +1 @@
 x
`;
    const r = parseUnifiedDiffByFile(diff);
    expect(r.changedFiles).toContain('new.name');
  });
});
