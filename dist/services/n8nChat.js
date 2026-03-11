import { config } from '../config/env.js';
import { fetchJson } from '../tools/http.js';
export function isN8nEnabled() {
    return Boolean(config.n8nWebhookUrl && config.n8nWebhookUrl.trim().length > 0);
}
export async function callN8nChat(payload, trace) {
    if (!isN8nEnabled()) {
        return { ok: false, error: 'N8N_WEBHOOK_URL no configurado' };
    }
    try {
        const { status, data } = await fetchJson(config.n8nWebhookUrl, {
            method: 'POST',
            body: payload,
            timeoutMs: config.n8nTimeout,
            trace,
            traceName: 'n8n.chat',
        });
        if (status < 200 || status >= 300) {
            return { ok: false, error: `n8n respondió HTTP ${status}` };
        }
        if (typeof data === 'string') {
            return { ok: true, output: data, raw: data };
        }
        const output = typeof data?.output === 'string' ? data.output.trim() : '';
        if (!output) {
            return { ok: false, error: 'n8n no devolvió { output }' };
        }
        return { ok: true, output, raw: data };
    }
    catch (err) {
        return { ok: false, error: err?.message ? String(err.message) : String(err) };
    }
}
