import { Router } from 'express';
import crypto from 'crypto';
import { callN8nChat, isN8nEnabled } from '../services/n8nChat.js';
import { extractCotizacionIds, includesAny, normalizeText } from '../tools/extractors.js';
import { getToolById, listTools } from '../tools/toolsRegistry.js';
import { buildMissingParams, projectParamsForTool, selectToolWithLLM } from '../tools/toolSelectorLLM.js';
const router = Router();
const PENDING_TTL_MS = 5 * 60 * 1000;
const pendingBySession = new Map();
const MEMORY_TTL_MS = 30 * 60 * 1000;
const memoryBySession = new Map();
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function isOnlyNumberMessage(text) {
    return /^\s*\d+\s*$/.test(text);
}
function toPositiveInt(value) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n))
        return undefined;
    const i = Math.trunc(n);
    if (i <= 0)
        return undefined;
    return i;
}
function getSessionMemory(sessionId) {
    const existing = memoryBySession.get(sessionId);
    if (existing && Date.now() - existing.updatedAt <= MEMORY_TTL_MS)
        return existing;
    const fresh = { updatedAt: Date.now() };
    memoryBySession.set(sessionId, fresh);
    return fresh;
}
function getRememberedCotizacionId(sessionId) {
    const existing = memoryBySession.get(sessionId);
    if (!existing)
        return undefined;
    if (Date.now() - existing.updatedAt > MEMORY_TTL_MS) {
        memoryBySession.delete(sessionId);
        return undefined;
    }
    return existing.lastCotizacionId;
}
function rememberCotizacionId(sessionId, cotizacionId) {
    const mem = getSessionMemory(sessionId);
    mem.lastCotizacionId = cotizacionId;
    mem.updatedAt = Date.now();
    memoryBySession.set(sessionId, mem);
}
function getKnownCotizacionId(chatInput, uiContext, sessionId) {
    const ids = extractCotizacionIds(chatInput);
    if (ids[0])
        return ids[0];
    const fromUi = toPositiveInt(uiContext?.cotizacionId);
    if (fromUi)
        return fromUi;
    return getRememberedCotizacionId(sessionId);
}
function shouldAutoFillCotizacionId(toolId) {
    return toolId === 'quote.detail' || toolId === 'quote.colors' || toolId === 'quote.components';
}
function getPending(sessionId) {
    const p = pendingBySession.get(sessionId);
    if (!p)
        return undefined;
    if (Date.now() - p.createdAt > PENDING_TTL_MS) {
        pendingBySession.delete(sessionId);
        return undefined;
    }
    return p;
}
function setPending(sessionId, pending) {
    pendingBySession.set(sessionId, pending);
}
function clearPending(sessionId) {
    pendingBySession.delete(sessionId);
}
function looksLikeToolRequest(chatInput, uiContext) {
    const normalized = normalizeText(chatInput);
    const ids = extractCotizacionIds(chatInput);
    if (ids.length > 0)
        return true;
    if (uiContext?.cotizacionId)
        return true;
    if (Array.isArray(uiContext?.selectedCotizacionIds) && uiContext.selectedCotizacionIds.length > 0)
        return true;
    return includesAny(normalized, [
        'detalle',
        'colores',
        'color',
        'compar',
        'compara',
        'comparar',
        'diferencia',
        'diff',
        'componentes',
        'component',
    ]);
}
function sanitizeUiContext(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const v = value;
    const screen = v.screen;
    if (!['cotizacion', 'dashboard', 'reportes', 'general'].includes(screen))
        return undefined;
    const route = typeof v.route === 'string' ? v.route : undefined;
    const cotizacionId = v.cotizacionId ?? undefined;
    const selectedCotizacionIds = Array.isArray(v.selectedCotizacionIds) ? v.selectedCotizacionIds : undefined;
    return {
        screen,
        route,
        cotizacionId,
        selectedCotizacionIds,
    };
}
router.get('/api/chat/health', (_req, res) => {
    return res.json({
        module: 'chat',
        status: 'ok',
        n8nEnabled: isN8nEnabled(),
        timestamp: new Date().toISOString(),
    });
});
/**
 * Contrato v1:
 * Request:  { chatInput, sessionId, uiContext? }
 * Response: { output }
 *
 * Nota: por ahora es un stub. En los siguientes pasos:
 * - selecciona tool (allowlist)
 * - ejecuta tool(s) contra backend principal
 * - construye toolResult compacto
 * - llama a n8n y retorna { output }
 */
router.post('/api/chat', async (req, res) => {
    const body = (req.body || {});
    if (!isNonEmptyString(body.chatInput) || !isNonEmptyString(body.sessionId)) {
        return res.status(400).json({
            output: 'Solicitud inválida: se requiere chatInput y sessionId.',
        });
    }
    const uiContext = sanitizeUiContext(body.uiContext);
    const traceId = crypto.randomUUID();
    const skipN8n = Boolean(body.options?.skipN8n);
    const chatInput = body.chatInput.trim();
    const sessionId = body.sessionId.trim();
    // Si el usuario manda un ID explícito, lo recordamos para el resto de la conversación.
    const knownCotizacionId = getKnownCotizacionId(chatInput, uiContext, sessionId);
    const explicitId = extractCotizacionIds(chatInput)[0] ?? toPositiveInt(uiContext?.cotizacionId);
    if (explicitId)
        rememberCotizacionId(sessionId, explicitId);
    // Para n8n, si no hay cotizacionId en uiContext pero sí recordado, lo adjuntamos.
    // Ojo: NO usamos este uiContext enriquecido para decidir "looksLikeToolRequest" (evita bloquear charla general).
    const uiContextForN8n = uiContext
        ? { ...uiContext, cotizacionId: uiContext.cotizacionId ?? knownCotizacionId }
        : knownCotizacionId
            ? { screen: 'general', cotizacionId: knownCotizacionId }
            : undefined;
    const pending = getPending(sessionId);
    // 1) Heurística determinista
    let selection = null;
    if (pending && pending.missingParams.includes('cotizacionId') && isOnlyNumberMessage(chatInput)) {
        const ids = extractCotizacionIds(chatInput);
        const cotizacionId = ids[0];
        if (cotizacionId) {
            selection = { toolId: pending.toolId, params: { cotizacionId } };
            clearPending(sessionId);
            rememberCotizacionId(sessionId, cotizacionId);
        }
    }
    if (!selection) {
        selection = selectTool(chatInput, uiContext);
        if (pending)
            clearPending(sessionId);
    }
    let selectorDebug = body.options?.debug ? { mode: selection ? 'heuristic' : 'heuristic:none' } : undefined;
    // Si seleccionamos una tool que necesita cotizacionId pero no vino en el texto, lo completamos desde memoria/contexto.
    if (selection && shouldAutoFillCotizacionId(selection.toolId)) {
        const params = selection.params ?? {};
        if (!toPositiveInt(params.cotizacionId) && knownCotizacionId) {
            selection = { ...selection, params: { ...params, cotizacionId: knownCotizacionId } };
        }
    }
    // Si no hay tool clara y el mensaje no parece una petición de tool,
    // delegamos la conversación a n8n (evita respuestas tipo "No identifiqué...").
    const shouldPreferN8n = !selection && isN8nEnabled() && !skipN8n && !looksLikeToolRequest(chatInput, uiContext);
    if (shouldPreferN8n) {
        const apiTrace = [];
        const n8n = await callN8nChat({ chatInput, sessionId, uiContext: uiContextForN8n, traceId }, apiTrace);
        if (n8n.ok) {
            return res.json({
                output: n8n.output,
                traceId,
                debug: body.options?.debug ? { mode: 'n8n:general', apiTrace, n8n: { ok: true, raw: n8n.raw }, selector: selectorDebug } : undefined,
            });
        }
        // Si n8n falla aquí, respondemos inmediato (evita volver a llamar a n8n más abajo y acumular timeouts).
        return res.json({
            output: 'En este momento no pude responder (problema de conexión con el asistente). Intenta nuevamente en unos segundos.',
            traceId,
            debug: body.options?.debug ? { mode: 'n8n:general:fallback', apiTrace, n8n: { ok: false, error: n8n.error }, selector: selectorDebug } : undefined,
        });
    }
    // 2) Si la heurística no decide, usamos LLM (allowlist + JSON estricto)
    if (!selection && !shouldPreferN8n) {
        const tools = listTools();
        const llm = await selectToolWithLLM({ chatInput, uiContext, tools });
        if (body.options?.debug)
            selectorDebug = { ...selectorDebug, llm: { decision: llm.decision, parsed: llm.parsed, rawText: llm.rawText } };
        if (llm.decision.kind === 'select') {
            selection = llm.decision.selection;
            if (body.options?.debug)
                selectorDebug = { ...selectorDebug, mode: 'llm' };
        }
        else if (llm.decision.kind === 'clarify') {
            // Si el LLM no detecta una tool y pide clarificar, pero el mensaje no parece tool,
            // dejamos que n8n responda conversacionalmente.
            if (isN8nEnabled() && !skipN8n && !looksLikeToolRequest(chatInput, uiContext)) {
                const apiTrace = [];
                const n8n = await callN8nChat({ chatInput, sessionId, uiContext: uiContextForN8n, traceId }, apiTrace);
                if (n8n.ok) {
                    return res.json({
                        output: n8n.output,
                        traceId,
                        debug: body.options?.debug ? { mode: 'n8n:general', apiTrace, n8n: { ok: true, raw: n8n.raw }, selector: selectorDebug } : undefined,
                    });
                }
                if (body.options?.debug)
                    selectorDebug = { ...selectorDebug, n8n: { ok: false, error: n8n.error }, apiTrace };
            }
            const toolResult = {
                intent: 'clarify',
                entities: {},
                artifacts: [
                    { type: 'warning', title: 'Faltan datos', data: { message: llm.decision.followUpQuestion } },
                ],
            };
            const finalOutput = llm.decision.followUpQuestion;
            if (body.options?.debug)
                selectorDebug = { ...selectorDebug, n8n: { skipped: true, reason: 'clarify' } };
            return res.json({
                output: finalOutput,
                toolResult,
                traceId,
                debug: body.options?.debug ? selectorDebug : undefined,
            });
        }
    }
    if (!selection) {
        // Si no hay tool, permitir conversación general vía n8n.
        if (isN8nEnabled() && !skipN8n) {
            const apiTrace = [];
            const n8n = await callN8nChat({ chatInput, sessionId, uiContext: uiContextForN8n, traceId }, apiTrace);
            if (n8n.ok) {
                return res.json({
                    output: n8n.output,
                    traceId,
                    debug: body.options?.debug ? { mode: 'n8n:general', apiTrace, n8n: { ok: true, raw: n8n.raw }, selector: selectorDebug } : undefined,
                });
            }
            // Si n8n falla, caemos al mensaje de ayuda.
            if (body.options?.debug)
                selectorDebug = { ...selectorDebug, n8n: { ok: false, error: n8n.error }, apiTrace };
        }
        const finalOutput = 'Puedo ayudarte con cotizaciones. Por ejemplo: "detalle 216881", "colores 216833", "componentes 216833" o "compara colores 21534 con 21454". ' +
            'Si me dices el ID de la cotización, te respondo al toque.';
        return res.json({
            output: finalOutput,
            traceId,
            debug: body.options?.debug ? selectorDebug : undefined,
        });
    }
    const tool = getToolById(selection.toolId);
    if (!tool) {
        return res.status(500).json({
            output: 'Error interno: tool no disponible.',
            traceId,
        });
    }
    // Normalizar params a la allowlist del tool y validar requeridos antes de ejecutar
    const projectedParams = projectParamsForTool(tool, selection.params ?? {});
    // Una vez que tenemos params proyectados, si hay cotizacionId válido, lo recordamos.
    const resolvedCotizacionId = toPositiveInt(projectedParams.cotizacionId);
    if (resolvedCotizacionId)
        rememberCotizacionId(sessionId, resolvedCotizacionId);
    const missingParams = buildMissingParams(tool, projectedParams);
    if (missingParams.length > 0) {
        const question = missingParams.includes('cotizacionId')
            ? '¿Cuál es el ID de la cotización?'
            : `Me faltan parámetros: ${missingParams.join(', ')}.`;
        const toolResult = {
            intent: 'clarify',
            entities: { toolId: tool.id, missingParams },
            artifacts: [{ type: 'warning', title: 'Faltan parámetros', data: { message: question } }],
        };
        setPending(sessionId, { toolId: tool.id, missingParams, createdAt: Date.now() });
        const finalOutput = question;
        if (body.options?.debug)
            selectorDebug = { ...selectorDebug, n8n: { skipped: true, reason: 'missingParams' } };
        return res.json({
            output: finalOutput,
            toolResult,
            traceId,
            debug: body.options?.debug ? selectorDebug : undefined,
        });
    }
    const apiTrace = [];
    const ctx = {
        sessionId,
        chatInput,
        uiContext,
        traceId,
        apiTrace,
    };
    try {
        const toolResult = await tool.execute(projectedParams, ctx);
        const fallbackOutput = renderToolResult(toolResult);
        // n8n: redacción final (si está configurado). Si falla, devolvemos el fallback.
        let finalOutput = fallbackOutput;
        let n8nDebug = undefined;
        if (isN8nEnabled() && !skipN8n) {
            const toolResultForN8n = shrinkToolResultForN8n(toolResult);
            const n8nChatInput = buildN8nChatInputForTool({
                userChatInput: chatInput,
                toolId: tool.id,
                projectedParams: projectedParams,
                toolResultForN8n,
            });
            const n8n = await callN8nChat({
                chatInput: n8nChatInput,
                sessionId,
                uiContext: uiContextForN8n,
                toolResult: toolResultForN8n,
                traceId,
            }, apiTrace);
            if (n8n.ok) {
                finalOutput = n8n.output;
                if (body.options?.debug)
                    n8nDebug = { ok: true, raw: n8n.raw };
            }
            else {
                if (body.options?.debug)
                    n8nDebug = { ok: false, error: n8n.error };
            }
        }
        else {
            if (body.options?.debug)
                n8nDebug = skipN8n ? { skipped: true, reason: 'skipN8n' } : { ok: false, error: 'N8N_WEBHOOK_URL no configurado' };
        }
        return res.json({
            output: finalOutput,
            toolResult,
            traceId,
            debug: body.options?.debug
                ? { toolId: tool.id, params: projectedParams, apiTrace, n8n: n8nDebug, selector: selectorDebug }
                : undefined,
        });
    }
    catch (error) {
        return res.status(500).json({
            output: 'Error al ejecutar la herramienta. Intenta nuevamente.',
            traceId,
            debug: body.options?.debug ? { message: error?.message ?? String(error) } : undefined,
        });
    }
});
function selectTool(chatInput, uiContext) {
    const text = normalizeText(chatInput);
    const ids = extractCotizacionIds(text);
    // Heurística v1: comparar colores si hay 2 IDs y keywords
    if (ids.length >= 2 && includesAny(text, ['compar', 'difer', 'versus', 'vs']) && text.includes('color')) {
        return { toolId: 'compare.colors', params: { cotizacionA: ids[0], cotizacionB: ids[1] } };
    }
    // Si pide comparar colores pero no dio 2 IDs: devolvemos selección parcial para pedirlos
    if (includesAny(text, ['compar', 'difer', 'versus', 'vs']) && text.includes('color') && ids.length < 2) {
        return {
            toolId: 'compare.colors',
            params: {
                ...(ids[0] ? { cotizacionA: ids[0] } : {}),
                ...(ids[1] ? { cotizacionB: ids[1] } : {}),
            },
        };
    }
    // Colores de una cotización
    if ((text.includes('color') || text.includes('colores')) && (ids[0] || uiContext?.cotizacionId)) {
        const cotizacionId = ids[0] ?? Number(uiContext?.cotizacionId);
        return { toolId: 'quote.colors', params: { cotizacionId } };
    }
    // Si pide colores pero no hay ID ni contexto: selección parcial para pedir cotizacionId
    if (text.includes('color') || text.includes('colores')) {
        return { toolId: 'quote.colors', params: {} };
    }
    // Componentes de una cotización
    if ((text.includes('componente') || text.includes('componentes')) && (ids[0] || uiContext?.cotizacionId)) {
        const cotizacionId = ids[0] ?? Number(uiContext?.cotizacionId);
        return { toolId: 'quote.components', params: { cotizacionId } };
    }
    // Si pide componentes pero no hay ID ni contexto: selección parcial
    if (text.includes('componente') || text.includes('componentes')) {
        return { toolId: 'quote.components', params: {} };
    }
    // Si el usuario manda solo un número, asumimos detalle
    if (ids.length === 1) {
        return { toolId: 'quote.detail', params: { cotizacionId: ids[0] } };
    }
    // Si hay cotizacionId en contexto y piden detalle
    if (uiContext?.cotizacionId && includesAny(text, ['detalle', 'resumen', 'cotizacion'])) {
        return { toolId: 'quote.detail', params: { cotizacionId: uiContext.cotizacionId } };
    }
    // Si piden detalle pero no hay ID: selección parcial para pedir cotizacionId
    if (includesAny(text, ['detalle', 'resumen', 'cotizacion'])) {
        return { toolId: 'quote.detail', params: {} };
    }
    return null;
}
function renderToolResult(toolResult) {
    // Render mínimo (temporal). n8n reemplazará esto en el siguiente paso.
    const parts = [];
    parts.push(`Acción: ${toolResult.intent}`);
    const summary = toolResult.artifacts.find(a => a.type === 'summary');
    if (summary?.data?.text)
        parts.push(String(summary.data.text));
    const warning = toolResult.artifacts.find(a => a.type === 'warning');
    if (warning?.data?.message)
        parts.push(`Nota: ${String(warning.data.message)}`);
    const facts = toolResult.artifacts.find(a => a.type === 'facts');
    if (facts?.data && typeof facts.data === 'object') {
        const f = facts.data;
        const lines = [];
        const keys = ['TCODICOTI', 'TEMPORADA', 'CLIENTE', 'ESTILO_NETTALCO', 'ESTILO_CLIENTE', 'ESTADO', 'PRECIO_FOB', 'COSTO_PONDERADO', 'MARKUP'];
        for (const k of keys) {
            if (f[k] !== undefined && f[k] !== null && String(f[k]).length > 0) {
                lines.push(`${k}: ${f[k]}`);
            }
        }
        if (lines.length)
            parts.push(lines.join('\n'));
    }
    const table = toolResult.artifacts.find(a => a.type === 'table');
    if (table?.data?.total !== undefined) {
        parts.push(`${table.title} (total: ${table.data.total})`);
    }
    const diff = toolResult.artifacts.find(a => a.type === 'diff');
    if (diff?.data?.counts) {
        const c = diff.data.counts;
        parts.push(`Comunes: ${c.common} | Solo A: ${c.onlyInA} | Solo B: ${c.onlyInB}`);
    }
    return parts.join('\n\n');
}
function shrinkToolResultForN8n(toolResult) {
    const artifacts = (toolResult.artifacts ?? []).map(a => {
        if (a.type !== 'table')
            return a;
        const data = a.data;
        const rows = Array.isArray(data?.rows) ? data.rows : null;
        if (!rows)
            return a;
        const maxRows = 40;
        if (rows.length <= maxRows)
            return a;
        return {
            ...a,
            data: {
                ...data,
                rows: rows.slice(0, maxRows),
                total: typeof data?.total === 'number' ? data.total : rows.length,
                truncatedForN8n: true,
                truncatedRows: maxRows,
            },
        };
    });
    return { ...toolResult, artifacts };
}
function buildN8nChatInputForTool(args) {
    const cotizacionId = toPositiveInt(args.projectedParams.cotizacionId);
    const hintByTool = {
        'quote.components': 'Redacta un resumen de componentes. Lista los principales (máx 10) y resume el resto. No pidas el ID (ya fue resuelto).',
        'quote.colors': 'Redacta un resumen de colores. Muestra los más relevantes y porcentajes si están disponibles. No pidas el ID (ya fue resuelto).',
        'quote.detail': 'Redacta un resumen del detalle de la cotización en viñetas. No pidas el ID (ya fue resuelto).',
        'compare.colors': 'Redacta una comparación clara de colores entre cotización A y B. No pidas IDs (ya fueron resueltos).',
    };
    const hint = hintByTool[args.toolId] ?? 'Redacta una respuesta clara usando los datos disponibles. No pidas IDs si ya están resueltos.';
    const safeJson = JSON.stringify(args.toolResultForN8n);
    const header = cotizacionId
        ? `Solicitud resuelta: ${args.toolId} para la cotización ${cotizacionId}.`
        : `Solicitud resuelta: ${args.toolId}.`;
    return [
        header,
        `Mensaje del usuario: ${args.userChatInput}`,
        `Instrucciones: ${hint}`,
        `Datos (JSON): ${safeJson}`,
    ].join('\n');
}
export default router;
