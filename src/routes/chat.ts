import { Router } from "express";
import crypto from "crypto";
import type {
  ChatRequest,
  ChatResponse,
  ToolResult,
  UiContext,
} from "../types/index.js";
import { isOpenAiProvider } from "../config/env.js";
import { callOpenAI } from "../ai/providers/openai.js";
// N8N (desactivado, usar OpenAI directo. Descomentar para reactivar)
// import { callN8nChat, isN8nEnabled } from '../services/n8nChat.js';
import {
  extractCotizacionIds,
  includesAny,
  normalizeText,
} from "../tools/extractors.js";
import { getToolById, listTools } from "../tools/toolsRegistry.js";
import type { ToolExecutionContext, ToolSelection } from "../tools/types.js";
import {
  buildMissingParams,
  projectParamsForTool,
  selectToolWithLLM,
} from "../tools/toolSelectorLLM.js";

const CHAT_SYSTEM_PROMPT = `# Rol
Eres un asistente de cotizaciones de la empresa Nettalco SA.

# Tarea
Debes responder a nuestros usuarios que van a usar el sistema de cotizaciones de forma amigable y ofrecer todos nuestros servicios, siempre en español.

# Servicios
- Detalle de una cotización
- Detalle de componentes de una cotización
- Detalle de colores de una cotización
- Comparación de colores entre dos cotizaciones
- Sugerencia de precios (análisis de histórico)
- Comparación de KPIs entre cotizaciones similares
- Búsqueda inteligente de cotizaciones previas (por estilo, cliente o global)

# Restricciones
- Responde solamente a lo que está relacionado con tu función.
- Si el usuario pide información pero no proporciona el ID de la cotización, pídelo amablemente.
- Si un ID proporcionado es explícitamente inválido, responde exactamente: "cotización inválida, intente de nuevo".
- Sé claro y conciso.
- Responde DIRECTAMENTE a lo que pregunta el usuario.
- No respondas con mensajes extensos, máximo 5 líneas.
- Solo utiliza información proveniente de las herramientas (datos proporcionados).
- Si una información no está disponible, indícalo claramente.`;

const router = Router();

type PendingToolRequest = {
  toolId: string;
  missingParams: string[];
  createdAt: number;
};

type SessionMemory = {
  lastCotizacionId?: number;
  updatedAt: number;
};

const PENDING_TTL_MS = 5 * 60 * 1000;
const pendingBySession = new Map<string, PendingToolRequest>();

const MEMORY_TTL_MS = 30 * 60 * 1000;
const recentCotizacionIdBySession = new Map<string, number[]>();

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOnlyNumberMessage(text: string): boolean {
  return /^\s*\d+\s*$/.test(text);
}

function toPositiveInt(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  if (i <= 0) return undefined;
  return i;
}

function getSessionMemory(sessionId: string): number[] {
  const existing = recentCotizacionIdBySession.get(sessionId);
  // Keep logic simple, if recent usage then fine, no TTL needed for simple arrays.
  return existing || [];
}

function rememberCotizacionIds(
  sessionId: string,
  cotizacionIds: number[],
): void {
  const current = recentCotizacionIdBySession.get(sessionId) || [];
  // Ensure unique elements and keep max 2 recent IDs
  const updated = [...new Set([...cotizacionIds, ...current])].slice(0, 2);
  recentCotizacionIdBySession.set(sessionId, updated);
}

function getRememberedCotizacionIds(sessionId: string): number[] {
  return recentCotizacionIdBySession.get(sessionId) || [];
}

/**
 * Devuelve un array de IDs conocidos combinando explícitos del mensaje,
 * el uiContext y el historial de memoria.
 */
function getKnownCotizacionIds(
  chatInput: string,
  uiContext?: UiContext,
  sessionId?: string,
): number[] {
  const ids = extractCotizacionIds(chatInput);
  if (ids.length > 0) return ids;

  const fromUi = toPositiveInt(uiContext?.cotizacionId);
  const selectedUi = Array.isArray(uiContext?.selectedCotizacionIds)
    ? (uiContext!
        .selectedCotizacionIds!.map(toPositiveInt)
        .filter(Boolean) as number[])
    : [];

  if (fromUi || selectedUi.length > 0) {
    const combined = [...new Set([...(fromUi ? [fromUi] : []), ...selectedUi])];
    return combined;
  }

  if (sessionId) {
    return getRememberedCotizacionIds(sessionId);
  }
  return [];
}

function shouldAutoFillCotizacionId(toolId: string): boolean {
  return (
    toolId === "quote.detail" ||
    toolId === "quote.colors" ||
    toolId === "quote.components" ||
    toolId === "quote.compare.client" ||
    toolId === "quote.compare.style" ||
    toolId === "quote.compare.global"
  );
}

function getPending(sessionId: string): PendingToolRequest | undefined {
  const p = pendingBySession.get(sessionId);
  if (!p) return undefined;
  if (Date.now() - p.createdAt > PENDING_TTL_MS) {
    pendingBySession.delete(sessionId);
    return undefined;
  }
  return p;
}

function setPending(sessionId: string, pending: PendingToolRequest): void {
  pendingBySession.set(sessionId, pending);
}

function clearPending(sessionId: string): void {
  pendingBySession.delete(sessionId);
}

function looksLikeToolRequest(
  chatInput: string,
  uiContext?: UiContext,
): boolean {
  const normalized = normalizeText(chatInput);

  // Mensajes muy genéricos o saludos no son peticiones de herramientas
  if (
    [
      "hola",
      "ola",
      "buenas",
      "buenos dias",
      "buenas tardes",
      "saludos",
      "ayuda",
      "hey",
    ].includes(normalized)
  ) {
    return false;
  }

  const ids = extractCotizacionIds(chatInput);

  if (ids.length > 0) return true;
  if (
    Array.isArray(uiContext?.selectedCotizacionIds) &&
    uiContext!.selectedCotizacionIds!.length > 0
  )
    return true;

  return includesAny(normalized, [
    "detalle",
    "colores",
    "color",
    "compar",
    "compara",
    "comparar",
    "diferencia",
    "diff",
    "componentes",
    "component",
    "costo",
    "precio",
    "estado",
    "cliente",
    "estilo",
    "prendas",
    "kpi",
    "kpis",
    "resumen",
    "markup",
    "margen",
    "valor",
    "mostrar",
    "muestra",
    "ver",
    "dime",
    "informacion",
  ]);
}

function sanitizeUiContext(value: unknown): UiContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as any;

  const screen = v.screen;
  if (!["cotizacion", "dashboard", "reportes", "general"].includes(screen))
    return undefined;

  const route = typeof v.route === "string" ? v.route : undefined;
  const cotizacionId = v.cotizacionId ?? undefined;
  const selectedCotizacionIds = Array.isArray(v.selectedCotizacionIds)
    ? v.selectedCotizacionIds
    : undefined;

  return {
    screen,
    route,
    cotizacionId,
    selectedCotizacionIds,
  };
}

router.get("/api/chat/health", (_req, res) => {
  return res.json({
    module: "chat",
    status: "ok",
    openaiEnabled: isOpenAiProvider(),
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
router.post("/api/chat", async (req, res) => {
  const body = (req.body || {}) as Partial<ChatRequest>;

  if (!isNonEmptyString(body.chatInput) || !isNonEmptyString(body.sessionId)) {
    return res.status(400).json({
      output: "Solicitud inválida: se requiere chatInput y sessionId.",
    } satisfies ChatResponse);
  }

  const uiContext = sanitizeUiContext(body.uiContext);
  const traceId = crypto.randomUUID();
  const skipN8n = Boolean((body as any).options?.skipN8n);

  const chatInput = body.chatInput.trim();
  const sessionId = body.sessionId.trim();

  // Si el usuario manda IDs explícitos, los recordamos para el resto de la conversación.
  const knownCotizacionIds = getKnownCotizacionIds(
    chatInput,
    uiContext,
    sessionId,
  );
  const explicitIds = extractCotizacionIds(chatInput);
  const idsToRemember =
    explicitIds.length > 0
      ? explicitIds
      : toPositiveInt(uiContext?.cotizacionId)
        ? [toPositiveInt(uiContext?.cotizacionId)!]
        : [];
  if (idsToRemember.length > 0) rememberCotizacionIds(sessionId, idsToRemember);

  // Para n8n, añadimos info sobre IDs conocidos.
  const uiContextForN8n: UiContext | undefined = uiContext
    ? ({
        ...uiContext,
        cotizacionId: uiContext.cotizacionId ?? knownCotizacionIds[0],
        selectedCotizacionIds: knownCotizacionIds,
      } as UiContext)
    : knownCotizacionIds.length > 0
      ? ({
          screen: "general",
          cotizacionId: knownCotizacionIds[0],
          selectedCotizacionIds: knownCotizacionIds,
        } as UiContext)
      : undefined;

  const pending = getPending(sessionId);

  // 1) Heurística determinista
  let selection: ToolSelection | null = null;
  if (
    pending &&
    pending.missingParams.includes("cotizacionId") &&
    isOnlyNumberMessage(chatInput)
  ) {
    const ids = extractCotizacionIds(chatInput);
    const cotizacionId = ids[0];
    if (cotizacionId) {
      selection = { toolId: pending.toolId, params: { cotizacionId } };
      clearPending(sessionId);
      rememberCotizacionIds(sessionId, [cotizacionId]);
    }
  }

  if (!selection) {
    selection = selectTool(chatInput, uiContext);
    if (pending) clearPending(sessionId);
  }
  let selectorDebug: any = body.options?.debug
    ? { mode: selection ? "heuristic" : "heuristic:none" }
    : undefined;

  // Si no hay tool clara y el mensaje no parece una petición de tool,
  // delegamos la conversación a OpenAI (evita respuestas tipo "No identifiqué...").
  const shouldPreferOpenAI =
    !selection &&
    isOpenAiProvider() &&
    !looksLikeToolRequest(chatInput, uiContext);
  if (shouldPreferOpenAI) {
    try {
      const result = await callOpenAI(CHAT_SYSTEM_PROMPT, chatInput, 300);
      if (result.text) {
        return res.json({
          output: result.text,
          traceId,
          debug: body.options?.debug
            ? {
                mode: "openai:general",
                model: result.model,
                selector: selectorDebug,
              }
            : undefined,
        } satisfies ChatResponse);
      }
    } catch (err: any) {
      console.error("[chat] OpenAI general call failed:", err?.message);
    }
    // Si OpenAI falla, respondemos inmediato.
    return res.json({
      output:
        "En este momento no pude responder. Intenta nuevamente en unos segundos.",
      traceId,
      debug: body.options?.debug
        ? { mode: "openai:general:fallback", selector: selectorDebug }
        : undefined,
    } satisfies ChatResponse);
  }

  // 2) Si la heurística no decide, usamos LLM (allowlist + JSON estricto)
  if (!selection && !shouldPreferOpenAI) {
    const tools = listTools();
    const llm = await selectToolWithLLM({
      chatInput,
      uiContext: uiContextForN8n,
      tools,
      pending,
    });
    if (body.options?.debug)
      selectorDebug = {
        ...selectorDebug,
        llm: {
          decision: llm.decision,
          parsed: llm.parsed,
          rawText: llm.rawText,
        },
      };

    if (llm.decision.kind === "select") {
      selection = llm.decision.selection;
      if (pending) clearPending(sessionId);
      if (body.options?.debug)
        selectorDebug = { ...selectorDebug, mode: "llm" };
    } else if (llm.decision.kind === "clarify") {
      // Si el LLM no detecta una tool y pide clarificar, pero el mensaje no parece tool,
      // dejamos que OpenAI responda conversacionalmente.
      if (isOpenAiProvider() && !looksLikeToolRequest(chatInput, uiContext)) {
        try {
          const result = await callOpenAI(CHAT_SYSTEM_PROMPT, chatInput, 300);
          if (result.text) {
            return res.json({
              output: result.text,
              traceId,
              debug: body.options?.debug
                ? {
                    mode: "openai:general",
                    model: result.model,
                    selector: selectorDebug,
                  }
                : undefined,
            } satisfies ChatResponse);
          }
        } catch (err: any) {
          if (body.options?.debug)
            selectorDebug = {
              ...selectorDebug,
              openai: { ok: false, error: err?.message },
            };
        }
      }

      const toolResult: ToolResult = {
        intent: "clarify",
        entities: {},
        artifacts: [
          {
            type: "warning",
            title: "Faltan datos",
            data: { message: llm.decision.followUpQuestion },
          },
        ],
      };

      const finalOutput = llm.decision.followUpQuestion;
      if (body.options?.debug)
        selectorDebug = {
          ...selectorDebug,
          n8n: { skipped: true, reason: "clarify" },
        };

      return res.json({
        output: finalOutput,
        toolResult,
        traceId,
        debug: body.options?.debug ? selectorDebug : undefined,
      } satisfies ChatResponse);
    }
  }

  if (!selection) {
    // Si no hay tool, permitir conversación general vía OpenAI.
    if (isOpenAiProvider()) {
      try {
        const result = await callOpenAI(CHAT_SYSTEM_PROMPT, chatInput, 300);
        if (result.text) {
          return res.json({
            output: result.text,
            traceId,
            debug: body.options?.debug
              ? {
                  mode: "openai:general",
                  model: result.model,
                  selector: selectorDebug,
                }
              : undefined,
          } satisfies ChatResponse);
        }
      } catch (err: any) {
        // Si OpenAI falla, caemos al mensaje de ayuda.
        if (body.options?.debug)
          selectorDebug = {
            ...selectorDebug,
            openai: { ok: false, error: err?.message },
          };
      }
    }

    const finalOutput =
      'Puedo ayudarte con cotizaciones. Por ejemplo: "detalle 216881", "colores 216833", "componentes 216833" o "compara colores 21534 con 21454". ' +
      "Si me dices el ID de la cotización, te respondo al toque.";
    return res.json({
      output: finalOutput,
      traceId,
      debug: body.options?.debug ? selectorDebug : undefined,
    } satisfies ChatResponse);
  }

  const tool = getToolById(selection.toolId);
  if (!tool) {
    return res.status(500).json({
      output: "Error interno: tool no disponible.",
      traceId,
    } satisfies ChatResponse);
  }

  // Si seleccionamos una tool que necesita cotizacionId pero no vino en el texto (por heurística o LLM),
  // lo completamos desde memoria/contexto ANTES de proyectar los parámetros.
  if (selection && shouldAutoFillCotizacionId(selection.toolId)) {
    const params: any = selection.params ?? {};
    if (!toPositiveInt(params.cotizacionId) && knownCotizacionIds.length > 0) {
      selection = {
        ...selection,
        params: { ...params, cotizacionId: knownCotizacionIds[0] },
      };
    }
  }

  if (
    (selection && selection.toolId === "quote.compare.two") ||
    selection?.toolId === "compare.colors"
  ) {
    const params: any = selection.params ?? {};
    if (!toPositiveInt(params.cotizacionA) && knownCotizacionIds.length >= 1) {
      selection = {
        ...selection,
        params: {
          ...params,
          cotizacionA: knownCotizacionIds[1] ?? params.cotizacionA,
        },
      };
    }
    if (!toPositiveInt(params.cotizacionB) && knownCotizacionIds.length >= 2) {
      selection = {
        ...selection,
        params: {
          ...params,
          cotizacionB: knownCotizacionIds[0] ?? params.cotizacionB,
        },
      };
    }
  }

  // Normalizar params a la allowlist del tool y validar requeridos antes de ejecutar
  const projectedParams = projectParamsForTool(tool, selection.params ?? {});

  // Una vez que tenemos params proyectados, si hay cotizacionId válido, lo recordamos.
  const resolvedCotizacionId = toPositiveInt(
    (projectedParams as any).cotizacionId,
  );
  if (resolvedCotizacionId)
    rememberCotizacionIds(sessionId, [resolvedCotizacionId]);

  const resolvedA = toPositiveInt((projectedParams as any).cotizacionA);
  const resolvedB = toPositiveInt((projectedParams as any).cotizacionB);
  if (resolvedA || resolvedB) {
    const toRemember = [
      ...(resolvedB ? [resolvedB] : []),
      ...(resolvedA ? [resolvedA] : []),
    ];
    rememberCotizacionIds(sessionId, toRemember);
  }

  const missingParams = buildMissingParams(tool, projectedParams);
  if (missingParams.length > 0) {
    const question = missingParams.includes("cotizacionId")
      ? "¿Cuál es el ID de la cotización?"
      : `Me faltan parámetros: ${missingParams.join(", ")}.`;

    const toolResult: ToolResult = {
      intent: "clarify",
      entities: { toolId: tool.id, missingParams },
      artifacts: [
        {
          type: "warning",
          title: "Faltan parámetros",
          data: { message: question },
        },
      ],
    };

    setPending(sessionId, {
      toolId: tool.id,
      missingParams,
      createdAt: Date.now(),
    });

    if (body.options?.debug)
      selectorDebug = {
        ...selectorDebug,
        n8n: { skipped: true, reason: "missingParams" },
      };

    return res.json({
      output: question,
      toolResult,
      traceId,
      debug: body.options?.debug ? selectorDebug : undefined,
    } satisfies ChatResponse);
  }

  const apiTrace: any[] = [];
  const ctx: ToolExecutionContext = {
    sessionId,
    chatInput,
    uiContext,
    traceId,
    apiTrace,
  };

  try {
    const toolResult = await tool.execute(projectedParams, ctx);

    // ── Flujo especializado para comparaciones ──
    const isComparisonTool = tool.id.startsWith("quote.compare.");
    if (isComparisonTool) {
      const compOutput = await buildComparisonOutput(
        toolResult,
        tool.id,
        chatInput,
      );
      return res.json({
        output: compOutput,
        toolResult,
        traceId,
        debug: body.options?.debug
          ? {
              toolId: tool.id,
              params: projectedParams,
              apiTrace,
              selector: selectorDebug,
            }
          : undefined,
      } satisfies ChatResponse);
    }

    // ── Flujo genérico para el resto de herramientas ──
    const fallbackOutput = renderToolResult(toolResult);
    let finalOutput = fallbackOutput;
    let aiDebug: any = undefined;

    if (isOpenAiProvider()) {
      try {
        const toolResultForRedaction = shrinkToolResultForN8n(toolResult);
        const redactionPrompt = buildN8nChatInputForTool({
          userChatInput: chatInput,
          toolId: tool.id,
          projectedParams: projectedParams as any,
          toolResultForN8n: toolResultForRedaction,
        });

        const redactionSystem = `Eres el asistente experto de cotizaciones de Nettalco SA. 
Reglas:
1. Responde en español y sé empático.
2. Si el usuario pide "el detalle" o "información" de la cotización, MUESTRA SIEMPRE UNA LISTA CON TODOS LOS DATOS (Cliente, Estado, FOB, Costo, Temporada, etc).
3. Si el usuario hace una PREGUNTA ESPECÍFICA (ej. "¿cuál es el costo?", "¿qué estado tiene?"), responde ÚNICAMENTE con ese dato en una oración natural, SIN mostrar la lista de los demás datos.
4. No pidas IDs de cotización porque tú ya los tienes. No inventes datos.`;
        const result = await callOpenAI(redactionSystem, redactionPrompt, 400);
        if (result.text) {
          finalOutput = result.text;
          if (body.options?.debug)
            aiDebug = { ok: true, provider: "openai", model: result.model };
        }
      } catch (err: any) {
        console.warn(
          "[chat] OpenAI redaction failed, using fallback:",
          err?.message,
        );
        if (body.options?.debug) aiDebug = { ok: false, error: err?.message };
      }
    }

    return res.json({
      output: finalOutput,
      toolResult,
      traceId,
      debug: body.options?.debug
        ? {
            toolId: tool.id,
            params: projectedParams,
            apiTrace,
            ai: aiDebug,
            selector: selectorDebug,
          }
        : undefined,
    } satisfies ChatResponse);
  } catch (error: any) {
    return res.status(500).json({
      output: "Error al ejecutar la herramienta. Intenta nuevamente.",
      traceId,
      debug: body.options?.debug
        ? { message: error?.message ?? String(error) }
        : undefined,
    } satisfies ChatResponse);
  }
});

function selectTool(
  chatInput: string,
  uiContext?: UiContext,
): ToolSelection | null {
  const text = normalizeText(chatInput);
  const ids = extractCotizacionIds(text);

  // Heurística v1: comparar colores si hay 2 IDs y keywords
  if (
    ids.length >= 2 &&
    includesAny(text, ["compar", "difer", "versus", "vs"]) &&
    text.includes("color")
  ) {
    return {
      toolId: "compare.colors",
      params: { cotizacionA: ids[0], cotizacionB: ids[1] },
    };
  }

  // Si pide comparar colores pero no dio 2 IDs: devolvemos selección parcial para pedirlos
  if (
    includesAny(text, ["compar", "difer", "versus", "vs"]) &&
    text.includes("color") &&
    ids.length < 2
  ) {
    return {
      toolId: "compare.colors",
      params: {
        ...(ids[0] ? { cotizacionA: ids[0] } : {}),
        ...(ids[1] ? { cotizacionB: ids[1] } : {}),
      },
    };
  }

  // Colores de una cotización
  if (
    (text.includes("color") || text.includes("colores")) &&
    (ids[0] || uiContext?.cotizacionId)
  ) {
    const cotizacionId = ids[0] ?? Number(uiContext?.cotizacionId);
    return { toolId: "quote.colors", params: { cotizacionId } };
  }

  // Si pide colores pero no hay ID ni contexto: selección parcial para pedir cotizacionId
  if (text.includes("color") || text.includes("colores")) {
    return { toolId: "quote.colors", params: {} };
  }

  // Componentes de una cotización
  if (
    (text.includes("componente") || text.includes("componentes")) &&
    (ids[0] || uiContext?.cotizacionId)
  ) {
    const cotizacionId = ids[0] ?? Number(uiContext?.cotizacionId);
    return { toolId: "quote.components", params: { cotizacionId } };
  }

  // Si pide componentes pero no hay ID ni contexto: selección parcial
  if (text.includes("componente") || text.includes("componentes")) {
    return { toolId: "quote.components", params: {} };
  }

  // Comparación por grupo (estilo cliente / cliente / global)
  if (
    includesAny(text, [
      "compar",
      "difer",
      "versus",
      "vs",
      "similar",
      "respecto",
    ])
  ) {
    const cotizacionId =
      ids[0] ??
      (uiContext?.cotizacionId ? Number(uiContext.cotizacionId) : undefined);

    if (includesAny(text, ["global", "toda", "todos", "general", "base"])) {
      return {
        toolId: "quote.compare.global",
        params: cotizacionId ? { cotizacionId } : {},
      };
    }
    if (includesAny(text, ["cliente"]) && !includesAny(text, ["estilo"])) {
      return {
        toolId: "quote.compare.client",
        params: cotizacionId ? { cotizacionId } : {},
      };
    }
    // Por defecto: comparar por estilo cliente (es la más común)
    return {
      toolId: "quote.compare.style",
      params: cotizacionId ? { cotizacionId } : {},
    };
  }

  // Si el usuario manda solo un número, asumimos detalle
  if (ids.length === 1) {
    return { toolId: "quote.detail", params: { cotizacionId: ids[0] } };
  }

  // Si hay cotizacionId en contexto y piden detalle
  if (
    uiContext?.cotizacionId &&
    includesAny(text, ["detalle", "resumen", "cotizacion"])
  ) {
    return {
      toolId: "quote.detail",
      params: { cotizacionId: uiContext.cotizacionId },
    };
  }

  // Si piden detalle pero no hay ID: selección parcial para pedir cotizacionId
  if (includesAny(text, ["detalle", "resumen", "cotizacion"])) {
    return { toolId: "quote.detail", params: {} };
  }

  return null;
}

const GRUPO_LABELS: Record<string, string> = {
  "quote.compare.style": "Estilo Cliente",
  "quote.compare.client": "Cliente",
  "quote.compare.global": "Global",
  "quote.compare.two": "Directa",
};

async function buildComparisonOutput(
  toolResult: ToolResult,
  toolId: string,
  chatInput: string,
): Promise<string> {
  // Si hay un warning (error/sin datos), retornarlo directamente
  const warning = toolResult.artifacts.find((a) => a.type === "warning");
  if (warning?.data?.message) return `⚠️ ${warning.data.message}`;

  const facts = toolResult.artifacts.find((a) => a.type === "facts");
  const table = toolResult.artifacts.find((a) => a.type === "table");
  const rows = (table?.data as any)?.rows as any[] | undefined;
  const factsData = facts?.data as any;

  if (!rows || rows.length === 0)
    return "⚠️ No se obtuvieron KPIs para la comparación.";

  const grupoLabel = GRUPO_LABELS[toolId] || "N/D";
  const cotBase = factsData?.["Cotización Base"] ?? "N/D";
  const totalCandidatos = factsData?.["Total Candidatos Evaluados"] ?? "N/D";

  // Construir tabla markdown (igual que sugerencias.ts)
  let output = `📊 **Comparación por ${grupoLabel}**\n\n`;
  output += `🔍 Se encontraron **${totalCandidatos} cotizaciones** de temporadas anteriores.\n`;
  output += `✅ Se seleccionó la cotización **#${cotBase}** como la más relevante.\n\n`;
  output += `📈 **Comparación de KPIs:**\n\n`;
  output += `| Indicador | Actual | Anterior | Diferencia |\n`;
  output += `|-----------|--------|----------|------------|\n`;

  for (const row of rows) {
    const ind = row.Indicador ?? "N/D";
    const act =
      row.Actual != null
        ? typeof row.Actual === "number"
          ? ind.includes("Markup")
            ? `${row.Actual.toFixed(1)}%`
            : `$${row.Actual.toFixed(2)}`
          : String(row.Actual)
        : "N/D";
    const ant =
      row.Anterior != null
        ? typeof row.Anterior === "number"
          ? ind.includes("Markup")
            ? `${row.Anterior.toFixed(1)}%`
            : `$${row.Anterior.toFixed(2)}`
          : String(row.Anterior)
        : "N/D";
    const dif =
      row.Diferencia != null
        ? typeof row.Diferencia === "number"
          ? ind.includes("Markup")
            ? `${row.Diferencia >= 0 ? "+" : ""}${row.Diferencia.toFixed(1)} pts`
            : ind.includes("Prendas")
              ? `${row.Diferencia >= 0 ? "+" : ""}${row.Diferencia}`
              : `${row.Diferencia >= 0 ? "+" : ""}$${row.Diferencia.toFixed(2)}`
          : String(row.Diferencia)
        : "N/D";
    output += `| **${ind}** | ${act} | ${ant} | ${dif} |\n`;
  }
  output += "\n";

  // Análisis con OpenAI
  if (isOpenAiProvider()) {
    try {
      const kpisSummary = rows
        .map(
          (r) =>
            `${r.Indicador}: Actual=${r.Actual}, Anterior=${r.Anterior}, Dif=${r.Diferencia}`,
        )
        .join("; ");
      const promptKpis = `Analiza esta comparación de KPIs entre cotizaciones textiles.\n${kpisSummary}\n\nDa un análisis EXTREMADAMENTE BREVE (máximo 3 oraciones). NO repitas los datos de la tabla. Si el Costo o Precio actual es $0 o 0, indica que aún no ha sido costeada. Tono profesional y directo.`;
      const systemKpis =
        "Eres un experto Analista de Costos textil B2B. Tu análisis va debajo de una tabla de datos. Máximo 3 oraciones.";
      const result = await callOpenAI(systemKpis, promptKpis, 600);
      if (result.text) {
        output += `💡 **Análisis:**\n${result.text}\n`;
        console.log(
          "[chat][comparacion] Análisis OpenAI generado:",
          result.text.slice(0, 100) + "...",
        );
      }
    } catch (err: any) {
      console.warn(
        "[chat][comparacion] Error generando análisis:",
        err?.message,
      );
    }
  }

  return output;
}

function renderToolResult(toolResult: ToolResult): string {
  // Render mínimo (temporal). n8n reemplazará esto en el siguiente paso.
  const parts: string[] = [];
  parts.push(`Acción: ${toolResult.intent}`);

  const summary = toolResult.artifacts.find((a) => a.type === "summary");
  if (summary?.data?.text) parts.push(String(summary.data.text));

  const warning = toolResult.artifacts.find((a) => a.type === "warning");
  if (warning?.data?.message)
    parts.push(`Nota: ${String(warning.data.message)}`);

  const facts = toolResult.artifacts.find((a) => a.type === "facts");
  if (facts?.data && typeof facts.data === "object") {
    const f = facts.data as any;
    const lines: string[] = [];
    const keys = [
      "TCODICOTI",
      "TEMPORADA",
      "CLIENTE",
      "ESTILO_NETTALCO",
      "ESTILO_CLIENTE",
      "ESTADO",
      "PRECIO_FOB",
      "COSTO_PONDERADO",
      "MARKUP",
    ];
    for (const k of keys) {
      if (f[k] !== undefined && f[k] !== null && String(f[k]).length > 0) {
        lines.push(`${k}: ${f[k]}`);
      }
    }
    if (lines.length) parts.push(lines.join("\n"));
  }

  const table = toolResult.artifacts.find((a) => a.type === "table");
  if (table?.data?.total !== undefined) {
    parts.push(`${table.title} (total: ${table.data.total})`);
  }

  const diff = toolResult.artifacts.find((a) => a.type === "diff");
  if (diff?.data?.counts) {
    const c = diff.data.counts;
    parts.push(
      `Comunes: ${c.common} | Solo A: ${c.onlyInA} | Solo B: ${c.onlyInB}`,
    );
  }

  return parts.join("\n\n");
}

function shrinkToolResultForN8n(toolResult: ToolResult): ToolResult {
  const artifacts = (toolResult.artifacts ?? []).map((a) => {
    if (a.type !== "table") return a;

    const data: any = a.data;
    const rows = Array.isArray(data?.rows) ? data.rows : null;
    if (!rows) return a;

    const maxRows = 40;
    if (rows.length <= maxRows) return a;

    return {
      ...a,
      data: {
        ...data,
        rows: rows.slice(0, maxRows),
        total: typeof data?.total === "number" ? data.total : rows.length,
        truncatedForN8n: true,
        truncatedRows: maxRows,
      },
    };
  });

  return { ...toolResult, artifacts };
}

function buildN8nChatInputForTool(args: {
  userChatInput: string;
  toolId: string;
  projectedParams: Record<string, any>;
  toolResultForN8n: ToolResult;
}): string {
  const cotizacionId = toPositiveInt(
    (args.projectedParams as any).cotizacionId,
  );

  const hintByTool: Record<string, string> = {
    "quote.components":
      "Empieza de forma amigable confirmando la solicitud y luego redacta un resumen de componentes. Lista los principales (máx 10) y resume el resto. No pidas el ID (ya fue resuelto).",
    "quote.colors":
      "Empieza de forma amigable y redacta un resumen de colores. Muestra los más relevantes y porcentajes si están disponibles. No pidas el ID (ya fue resuelto).",
    "quote.detail":
      'IMPORTANTE: Lee el "Mensaje del usuario". Si pide un campo específico (ej. "costo", "estado"), responde SOLO ESE DATO en una o dos líneas, IGNORA EL RESTO Y NO USES VIÑETAS BAJO NINGUNA CIRCUNSTANCIA. Solo si el usuario usa la palabra "detalle" o "resumen", entonces sí muestra los datos en una lista con viñetas.',
    "compare.colors":
      "Empieza de forma amigable y redacta una comparación clara de colores entre cotización A y B. No pidas IDs (ya fueron resueltos).",
    "quote.compare.client":
      "Empieza de forma amigable y redacta una comparación de KPIs frente a otras cotizaciones del mismo cliente. Menciona la diferencia de precios y prendas estimadas.",
    "quote.compare.style":
      "Empieza de forma amigable y redacta una comparación de KPIs frente a otras cotizaciones del mismo estilo. Menciona la diferencia de precios y prendas estimadas.",
    "quote.compare.global":
      "Empieza de forma amigable y redacta una comparación de KPIs a nivel global. Menciona la diferencia de precios y prendas estimadas.",
    "quote.compare.two":
      "Empieza de forma amigable y redacta una comparación directa de KPIs entre la cotización A y la B. Menciona las diferencias en precio, costo y prendas estimadas.",
  };

  const hint =
    hintByTool[args.toolId] ??
    "Redacta una respuesta clara y amigable usando los datos disponibles. No pidas IDs si ya están resueltos.";
  const safeJson = JSON.stringify(args.toolResultForN8n);

  const header = cotizacionId
    ? `Solicitud resuelta: ${args.toolId} para la cotización ${cotizacionId}.`
    : `Solicitud resuelta: ${args.toolId}.`;

  return [
    header,
    `Mensaje Original del Usuario: "${args.userChatInput}"`,
    `Instrucciones de formato: ${hint}`,
    `Datos técnicos: ${safeJson}`,
  ].join("\n\n");
}

export default router;
