import { config } from '../config/env.js';
import type { CachedListaEntry } from '../types/index.js';

// Cache LRU en memoria para listas de cotizaciones
const listaCache = new Map<string, CachedListaEntry>();
const listaCacheOrder: string[] = [];

export function cacheListaSet(hash: string, rows: any[]): void {
  if (!hash) return;

  const max = config.maxListaCacheEntries;

  if (!listaCache.has(hash)) {
    listaCacheOrder.push(hash);
  }

  listaCache.set(hash, { rows, ts: Date.now() });

  // Evict oldest entries if over limit
  while (listaCacheOrder.length > max) {
    const oldest = listaCacheOrder.shift();
    if (oldest) listaCache.delete(oldest);
  }
}

export function cacheListaGet(hash: string): any[] | null {
  const entry = hash ? listaCache.get(hash) : undefined;
  return entry ? entry.rows : null;
}

export function cacheListaClear(): void {
  listaCache.clear();
  listaCacheOrder.length = 0;
}

export function cacheListaStats(): { size: number; maxSize: number } {
  return {
    size: listaCache.size,
    maxSize: config.maxListaCacheEntries,
  };
}
