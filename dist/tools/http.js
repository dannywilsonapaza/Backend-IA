import { config } from '../config/env.js';
export async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? config.backendPrincipalTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = Date.now();
    let status = 0;
    try {
        const response = await fetch(url, {
            method: options.method ?? 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(options.headers ?? {})
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal
        });
        status = response.status;
        const raw = await response.text();
        const data = raw ? JSON.parse(raw) : null;
        return { status, data };
    }
    finally {
        clearTimeout(timeoutId);
        const t1 = Date.now();
        if (options.trace && options.traceName) {
            options.trace.push({
                name: options.traceName,
                url,
                ms: t1 - t0,
                status: status || undefined,
            });
        }
    }
}
