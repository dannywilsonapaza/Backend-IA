import { isOpenAiProvider, isOllamaProvider } from '../config/env.js';
import { callOllama } from '../ai/providers/ollama.js';
import { callOpenAI } from '../ai/providers/openai.js';
function stripCodeFences(text) {
    const t = (text || '').trim();
    // ```json ... ``` or ``` ... ```
    if (t.startsWith('```')) {
        return t.replace(/^```[a-zA-Z]*\s*/m, '').replace(/\s*```$/m, '').trim();
    }
    return t;
}
function safeJsonParse(text) {
    const cleaned = stripCodeFences(text);
    try {
        return JSON.parse(cleaned);
    }
    catch {
        // attempt to extract first JSON object
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(cleaned.slice(start, end + 1));
            }
            catch {
                return null;
            }
        }
        return null;
    }
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function defaultQuestionForMissing(toolId, missing) {
    if (!missing.length)
        return '¿Qué necesitas exactamente?';
    if (toolId === 'compare.colors')
        return 'Necesito 2 IDs de cotización para comparar colores (ej: "compara colores 216833 vs 216881").';
    if (missing.includes('cotizacionId'))
        return '¿Cuál es el ID de la cotización?';
    if (missing.includes('cotizacionA') || missing.includes('cotizacionB'))
        return 'Necesito 2 IDs de cotización (A y B). ¿Cuáles son?';
    return `Me falta información: ${missing.join(', ')}.`;
}
function buildSystemPrompt() {
    return [
        'Eres un motor de enrutamiento (tool router) para un sistema de cotizaciones textiles.',
        'Debes seleccionar UNA herramienta de una lista permitida (allowlist).',
        'PROHIBIDO: inventar herramientas, inventar endpoints, inventar parámetros.',
        'Si falta un parámetro requerido, devuelve toolId con missingParams y una followUpQuestion clara.',
        '',
        'SALIDA OBLIGATORIA: devuelve SOLO JSON válido, sin markdown, sin texto extra.',
        'Esquema:',
        '{',
        '  "toolId": string | null,',
        '  "params": object,',
        '  "missingParams": string[],',
        '  "confidence": number,',
        '  "followUpQuestion": string | null,',
        '  "reason": string',
        '}',
    ].join('\n');
}
function buildUserPrompt(args) {
    const tools = args.tools.map(t => ({
        id: t.id,
        description: t.description,
        requiredParams: t.requiredParams ?? [],
        examples: t.examples ?? [],
    }));
    return [
        'Entrada del usuario:',
        args.chatInput,
        '',
        'uiContext (puede ser null):',
        JSON.stringify(args.uiContext ?? null),
        '',
        'Tools allowlist:',
        JSON.stringify(tools),
        '',
        'Reglas:',
        '- Si el usuario pide "colores" y hay cotizacionId en uiContext, úsalo.',
        '- Si el usuario no dio IDs y no hay cotizacionId, pide el/los ID(s).',
    ].join('\n');
}
export async function selectToolWithLLM(args) {
    if (!isOllamaProvider() && !isOpenAiProvider()) {
        return { decision: { kind: 'none', confidence: 0, reason: 'No hay proveedor LLM habilitado' } };
    }
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(args);
    let rawText = '';
    try {
        if (isOpenAiProvider()) {
            const r = await callOpenAI(systemPrompt, userPrompt, 350);
            rawText = r.text;
        }
        else {
            const r = await callOllama(systemPrompt, userPrompt, 350);
            rawText = r.text;
        }
    }
    catch (err) {
        return { decision: { kind: 'none', confidence: 0, reason: err?.message ? String(err.message) : String(err) } };
    }
    const parsed = safeJsonParse(rawText);
    if (!isRecord(parsed)) {
        return { decision: { kind: 'none', confidence: 0.1, reason: 'No se pudo parsear JSON del LLM' }, rawText };
    }
    const toolId = typeof parsed.toolId === 'string' ? parsed.toolId : null;
    const params = isRecord(parsed.params) ? parsed.params : {};
    const missingParams = Array.isArray(parsed.missingParams) ? parsed.missingParams.filter((x) => typeof x === 'string') : [];
    const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence) ? parsed.confidence : 0.5;
    const followUpQuestion = typeof parsed.followUpQuestion === 'string' ? parsed.followUpQuestion.trim() : null;
    const reason = typeof parsed.reason === 'string' ? parsed.reason : undefined;
    const toolIds = new Set(args.tools.map(t => t.id));
    if (toolId && !toolIds.has(toolId)) {
        return { decision: { kind: 'none', confidence: 0.2, reason: 'toolId fuera de allowlist' }, rawText, parsed };
    }
    if (!toolId) {
        return {
            decision: {
                kind: followUpQuestion ? 'clarify' : 'none',
                confidence,
                reason,
                ...(followUpQuestion ? { followUpQuestion } : {}),
            },
            rawText,
            parsed,
        };
    }
    if (missingParams.length > 0) {
        return {
            decision: {
                kind: 'clarify',
                confidence,
                reason,
                followUpQuestion: followUpQuestion || defaultQuestionForMissing(toolId, missingParams),
            },
            rawText,
            parsed,
        };
    }
    return {
        decision: {
            kind: 'select',
            confidence,
            reason,
            selection: { toolId, params },
        },
        rawText,
        parsed,
    };
}
export function buildMissingParams(tool, params) {
    const required = tool.requiredParams ?? [];
    const missing = [];
    for (const key of required) {
        const v = params[key];
        if (v === undefined || v === null || (typeof v === 'string' && v.trim().length === 0)) {
            missing.push(key);
        }
    }
    return missing;
}
export function projectParamsForTool(tool, params) {
    // Permite solo claves esperadas (requiredParams) + algunas alias conocidas.
    const allowed = new Set([...(tool.requiredParams ?? [])]);
    const out = {};
    for (const [k, v] of Object.entries(params ?? {})) {
        if (allowed.has(k))
            out[k] = v;
    }
    return out;
}
