export const extractJsonFromText = (text: string): any | null => {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  const match = objectMatch && arrayMatch ? (objectMatch.index! < arrayMatch.index! ? objectMatch[0] : arrayMatch[0]) : objectMatch?.[0] || arrayMatch?.[0];
  const candidate = match || raw;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

export const extractJsonObjectFromText = (text: string): Record<string, unknown> | null => {
  const parsed = extractJsonFromText(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
};

export const extractJsonArrayFromText = (text: string): unknown[] | null => {
  const parsed = extractJsonFromText(text);
  if (!Array.isArray(parsed)) return null;
  return parsed;
};

