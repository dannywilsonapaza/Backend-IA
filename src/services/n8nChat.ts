import { config } from '../config/env.js';
import { fetchJson } from '../tools/http.js';
import type { ApiTraceItem } from '../tools/http.js';
import type { ToolResult, UiContext } from '../types/index.js';

export interface N8nChatRequest {
  chatInput: string;
  sessionId: string;
  uiContext?: UiContext;
  toolResult?: ToolResult;
  traceId?: string;
}

export interface N8nChatResponse {
  output?: string;
  [key: string]: any;
}

export function isN8nEnabled(): boolean {
  return Boolean(config.n8nWebhookUrl && config.n8nWebhookUrl.trim().length > 0);
}

export async function callN8nChat(
  payload: N8nChatRequest,
  trace?: ApiTraceItem[]
): Promise<{ ok: true; output: string; raw: any } | { ok: false; error: string }>
{
  if (!isN8nEnabled()) {
    return { ok: false, error: 'N8N_WEBHOOK_URL no configurado' };
  }

  try {
    const { status, data } = await fetchJson<N8nChatResponse | string>(config.n8nWebhookUrl, {
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

    // N8N en modo "Embedded Chat" puede devolver un array [{ output: "..." }]
    const item = Array.isArray(data) ? data[0] : data;
    const output = typeof (item as any)?.output === 'string' ? (item as any).output.trim() : '';
    if (!output) {
      return { ok: false, error: `n8n no devolvió { output }. Recibido: ${JSON.stringify(data).substring(0, 200)}` };
    }

    return { ok: true, output, raw: data };
  } catch (err: any) {
    return { ok: false, error: err?.message ? String(err.message) : String(err) };
  }
}
