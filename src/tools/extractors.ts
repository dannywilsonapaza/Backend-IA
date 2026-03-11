export function extractCotizacionIds(text: string): number[] {
  if (!text) return [];
  const matches = text.match(/\b\d{4,10}\b/g) ?? [];
  const ids = matches
    .map(m => Number(m))
    .filter(n => Number.isFinite(n) && n > 0);

  // unique preserving order
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function normalizeText(text: string): string {
  return (text || '').toLowerCase().trim();
}

export function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some(n => haystack.includes(n));
}
