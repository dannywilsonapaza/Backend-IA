import { config } from '../config/env.js';
// Cache LRU en memoria para listas de cotizaciones
const listaCache = new Map();
const listaCacheOrder = [];
export function cacheListaSet(hash, rows) {
    if (!hash)
        return;
    const max = config.maxListaCacheEntries;
    if (!listaCache.has(hash)) {
        listaCacheOrder.push(hash);
    }
    listaCache.set(hash, { rows, ts: Date.now() });
    // Evict oldest entries if over limit
    while (listaCacheOrder.length > max) {
        const oldest = listaCacheOrder.shift();
        if (oldest)
            listaCache.delete(oldest);
    }
}
export function cacheListaGet(hash) {
    const entry = hash ? listaCache.get(hash) : undefined;
    return entry ? entry.rows : null;
}
export function cacheListaClear() {
    listaCache.clear();
    listaCacheOrder.length = 0;
}
export function cacheListaStats() {
    return {
        size: listaCache.size,
        maxSize: config.maxListaCacheEntries,
    };
}
