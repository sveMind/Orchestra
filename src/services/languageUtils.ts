import path from 'path';

export type CodeLanguage = 'typescript' | 'javascript' | 'python' | 'c' | 'java' | 'unknown';

export const inferLanguageFromExtension = (filePath: string): CodeLanguage => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.ts' || ext === '.tsx') return 'typescript';
    if (ext === '.js' || ext === '.jsx') return 'javascript';
    if (ext === '.py') return 'python';
    if (ext === '.c' || ext === '.h') return 'c';
    if (ext === '.java') return 'java';
    return 'unknown';
};

export const inferLanguageFromText = (text: string): CodeLanguage => {
    const lower = text.toLowerCase();
    if (lower.includes(' in c ') || lower.includes(' language: c') || lower.includes(' c code') || lower.includes(' c program')) {
        return 'c';
    }
    if (lower.includes('python') || lower.includes(' pytest') || lower.includes(' py ')) {
        return 'python';
    }
    if (lower.includes('typescript') || lower.includes(' ts ')) {
        return 'typescript';
    }
    if (lower.includes('javascript') || lower.includes(' js ') || lower.includes(' node ')) {
        return 'javascript';
    }
    if (lower.includes(' java')) {
        return 'java';
    }
    return 'unknown';
};

export const pickLanguageFromTextOrExtension = (text: string, filePath: string): CodeLanguage => {
    const fromText = inferLanguageFromText(text);
    if (fromText !== 'unknown') return fromText;
    const fromExt = inferLanguageFromExtension(filePath);
    if (fromExt !== 'unknown') return fromExt;
    return 'typescript';
};

export const getExtensionForLanguage = (language: CodeLanguage): string => {
    if (language === 'c') return '.c';
    if (language === 'python') return '.py';
    if (language === 'javascript') return '.js';
    if (language === 'java') return '.java';
    return '.ts';
};

export const getFeatureSlugFromTitle = (title: string): string => {
    let lower = title.toLowerCase();
    const cutPatterns = [
        ' in c',
        ' in python',
        ' in typescript',
        ' in javascript',
        ' in java',
        ' in a new folder',
        ' in examples',
        ' in example',
        ' in src',
        ' in features'
    ];

    for (const pattern of cutPatterns) {
        const idx = lower.indexOf(pattern);
        if (idx !== -1) {
            lower = lower.substring(0, idx);
            break;
        }
    }

    let slug = lower
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (!slug) slug = 'feature';

    if (slug.length > 60) {
        slug = slug.substring(0, 60).replace(/-+$/g, '');
    }

    return slug;
};

