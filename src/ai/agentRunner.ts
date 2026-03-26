/**
 * Agent Runner — Assistants API de OpenAI (Threads + Runs)
 *
 * Usa la Assistants API para gestionar el historial de conversación
 * en los servidores de OpenAI (Threads) y ejecutar tools vía Runs.
 * La memoria persiste entre reinicios del servidor.
 */
import { getOpenAIClient } from "./providers/openai.js";
import { config } from "../config/env.js";
import { getToolById } from "../tools/toolsRegistry.js";
import type { ToolExecutionContext } from "../tools/types.js";
import type { ToolResult, UiContext } from "../types/index.js";
import { callOpenAIWithModel } from "./providers/openai.js";

// ── Mapeo sesión → thread ──────────────────────────────────────
const sessionToThread = new Map<
  string,
  { threadId: string; updatedAt: number }
>();
const SESSION_TTL_MS = 30 * 60 * 1000;

// Limpieza periódica de sesiones expiradas
const cleanupTimer = setInterval(
  () => {
    const now = Date.now();
    for (const [id, s] of sessionToThread) {
      if (now - s.updatedAt > SESSION_TTL_MS) sessionToThread.delete(id);
    }
  },
  5 * 60 * 1000,
);
cleanupTimer.unref();

async function getOrCreateThread(sessionId: string): Promise<string> {
  const existing = sessionToThread.get(sessionId);
  if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) {
    existing.updatedAt = Date.now();
    return existing.threadId;
  }

  const openai = getOpenAIClient();
  const thread = await openai.beta.threads.create();
  sessionToThread.set(sessionId, {
    threadId: thread.id,
    updatedAt: Date.now(),
  });
  console.log(
    `[agent] Nuevo thread creado: ${thread.id} para sesión ${sessionId}`,
  );
  return thread.id;
}

// ── Rate limit (TPM) handling: resumir + rotar thread ─────────

function isTpmRateLimitMessage(msg: string): boolean {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("rate limit reached") &&
    (m.includes("tokens per min") || m.includes("tpm"))
  );
}

function parseRetryAfterMs(msg: string): number | null {
  const m = (msg || "").match(/try again in\s+(\d+)\s*ms/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function extractTextFromAssistantMessageContent(content: any[]): string {
  if (!Array.isArray(content)) return "";
  const textBlock = content.find((c) => c?.type === "text");
  const text =
    textBlock?.type === "text" ? String(textBlock.text?.value || "") : "";
  return text;
}

async function summarizeThreadForRotation(
  openai: ReturnType<typeof getOpenAIClient>,
  threadId: string,
) {
  // Tomamos una ventana acotada de mensajes para mantener el resumen barato.
  const messages = await openai.beta.threads.messages.list(threadId, {
    order: "asc",
    limit: 40,
  });

  const transcriptLines: string[] = [];
  for (const msg of messages.data || []) {
    const role = msg.role === "assistant" ? "Asistente" : "Usuario";
    const text = extractTextFromAssistantMessageContent(msg.content as any);
    const t = (text || "").trim();
    if (!t) continue;
    transcriptLines.push(`${role}: ${t}`);
  }

  const transcript = transcriptLines.join("\n").slice(0, 14000);

  const systemPrompt =
    "Eres un compresor de historial de chat para un asistente de cotizaciones textiles. " +
    "Devuelve un resumen corto y útil para continuar la conversación. No inventes datos.";

  const userPrompt =
    "Resume el historial para continuar sin perder contexto.\n" +
    "Incluye SIEMPRE (si existe):\n" +
    "- Objetivo del usuario\n" +
    "- IDs de cotización y qué se hizo con cada uno\n" +
    "- Números clave (precio/costo/markup)\n" +
    "- Herramientas usadas (quote.detail, quote.colors, etc.)\n" +
    "- Pendientes / siguiente paso\n" +
    "Formato: viñetas. Máximo 1200 caracteres.\n\n" +
    `HISTORIAL:\n${transcript}`;

  try {
    const r = await callOpenAIWithModel(
      config.openaiSummaryModel,
      systemPrompt,
      userPrompt,
      220,
    );
    return (r.text || "").trim() || "Resumen no disponible.";
  } catch {
    return "Resumen no disponible (error generando resumen).";
  }
}

async function rotateThreadWithSummary(args: {
  openai: ReturnType<typeof getOpenAIClient>;
  sessionId: string;
  summary: string;
  chatInput: string;
  uiContext?: UiContext;
}): Promise<string> {
  const newThread = await args.openai.beta.threads.create();

  const ui = args.uiContext?.cotizacionId
    ? `Contexto UI: el usuario está viendo la cotización #${args.uiContext.cotizacionId}`
    : "Contexto UI: (no provisto)";

  const content =
    `[RESUMEN DEL HISTORIAL]\n${args.summary}\n\n` +
    `[${ui}]\n\n` +
    `[PETICIÓN ACTUAL]\n${args.chatInput}`;

  await args.openai.beta.threads.messages.create(newThread.id, {
    role: "user",
    content,
  });

  sessionToThread.set(args.sessionId, {
    threadId: newThread.id,
    updatedAt: Date.now(),
  });

  console.log(
    `[agent] Rotación de thread por TPM: nuevo thread ${newThread.id} para sesión ${args.sessionId}`,
  );
  return newThread.id;
}

// ── Mapeo de funciones OpenAI → tool ID interno ────────────────
const FUNCTION_TO_TOOL_ID: Record<string, string> = {
  obtener_detalle: "quote.detail",
  obtener_colores: "quote.colors",
  obtener_componentes: "quote.components",
  obtener_descriptores_estilo_nettalco: "quote.descriptores.estiloNettalco",
  obtener_dimensiones_estilo_nettalco: "quote.dimensiones.estiloNettalco",
  obtener_extras_cotizacion: "quote.extras.cotizacion",
  obtener_hilados_color_cotizacion: "quote.hilados.color.cotizacion",
  obtener_hilados_especiales_cotizacion: "quote.hilados.especiales.cotizacion",
  obtener_minutajes_cotizacion: "quote.minutajes.cotizacion",
  listar_candidatos: "quote.compare.candidates",
  comparar_kpis: "quote.compare.kpis",
  comparar_componentes: "quote.compare.components",
  comparar_minutajes: "quote.compare.minutajes",
  buscar_cotizacion: "quote.search",
  sugerir_precio: "quote.suggest.price",
  calcular_markup: "quote.calc.markup",
  predecir_precio_ml: "quote.predict.price",
};

// ── Formatear resultados de herramientas para el modelo ────────
function formatToolResultForModel(toolResult: ToolResult): string {
  const parts: string[] = [];

  for (const artifact of toolResult.artifacts) {
    switch (artifact.type) {
      case "warning":
        parts.push(`⚠️ ${artifact.data?.message || artifact.title}`);
        break;

      case "facts": {
        parts.push(`${artifact.title}:`);
        for (const [k, v] of Object.entries(artifact.data || {})) {
          if (v !== null && v !== undefined && String(v).length > 0) {
            parts.push(`  ${k}: ${v}`);
          }
        }
        break;
      }

      case "table": {
        const data = artifact.data as any;
        const rows = data?.rows as any[];
        parts.push(`${artifact.title} (total: ${data?.total ?? "?"}):`);
        if (rows?.length) {
          for (const row of rows.slice(0, 50)) {
            const fields = Object.entries(row)
              .map(([k, v]) => `${k}: ${v ?? "N/D"}`)
              .join(", ");
            parts.push(`  - ${fields}`);
          }
          if (rows.length > 50) parts.push(`  ... (${rows.length - 50} más)`);
        }
        break;
      }

      case "diff": {
        const data = artifact.data as any;
        parts.push(`${artifact.title}:`);
        if (data?.counts) {
          parts.push(
            `  Comunes: ${data.counts.common}, Solo en A: ${data.counts.onlyInA}, Solo en B: ${data.counts.onlyInB}`,
          );
        }
        if (data?.common?.length) {
          parts.push(
            `  Colores comunes: ${data.common
              .slice(0, 10)
              .map((c: any) => c.desccoln || c.numecoln)
              .join(", ")}`,
          );
        }
        if (data?.onlyInA?.length) {
          parts.push(
            `  Solo en A: ${data.onlyInA
              .slice(0, 10)
              .map((c: any) => c.desccoln || c.numecoln)
              .join(", ")}`,
          );
        }
        if (data?.onlyInB?.length) {
          parts.push(
            `  Solo en B: ${data.onlyInB
              .slice(0, 10)
              .map((c: any) => c.desccoln || c.numecoln)
              .join(", ")}`,
          );
        }
        break;
      }

      case "summary":
        parts.push(artifact.data?.text || artifact.title);
        break;

      default:
        if (artifact.data)
          parts.push(
            `${artifact.title}: ${JSON.stringify(artifact.data).slice(0, 500)}`,
          );
    }
  }

  return parts.join("\n") || "Sin datos disponibles.";
}

// ── Agente principal (Assistants API) ──────────────────────────
const MAX_TOOL_ITERATIONS = 5;

export interface AgentResult {
  output: string;
  toolResults: ToolResult[];
  debug?: {
    iterations: number;
    toolsCalled: number;
    model: string;
    usage: any;
    apiTrace: any[];
  };
}

export async function runAgent(args: {
  chatInput: string;
  sessionId: string;
  uiContext?: UiContext;
  traceId: string;
}): Promise<AgentResult> {
  const openai = getOpenAIClient();
  const assistantId = config.openaiAssistantId;

  if (!assistantId) {
    throw new Error(
      "OPENAI_ASSISTANT_ID no configurado. Ejecuta: npx tsx scripts/setup-assistant.ts",
    );
  }

  let threadId = await getOrCreateThread(args.sessionId);
  let didRotateThread = false;
  let didQuickRetry = false;

  // Construir mensaje del usuario con contexto de UI
  let userContent = args.chatInput;
  if (args.uiContext?.cotizacionId) {
    userContent = `[Contexto: el usuario está viendo la cotización #${args.uiContext.cotizacionId}]\n${args.chatInput}`;
  }

  // Agregar mensaje al thread
  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: userContent,
  });

  // Crear el Run
  let run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
  });

  const toolResults: ToolResult[] = [];
  const apiTrace: any[] = [];
  let iterations = 0;

  // Loop: Esperar a que el Run termine o pida tools
  while (iterations < MAX_TOOL_ITERATIONS) {
    // Polling del Run hasta que cambie de estado
    run = await pollRunUntilActionable(openai, threadId, run.id);

    if (run.status === "completed") {
      break;
    }

    if (run.status === "requires_action") {
      iterations++;
      const toolCalls =
        run.required_action?.submit_tool_outputs?.tool_calls || [];

      const toolOutputs: Array<{ tool_call_id: string; output: string }> = [];

      for (const toolCall of toolCalls) {
        const fnName = toolCall.function.name;
        let fnArgs: Record<string, any>;
        try {
          fnArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          fnArgs = {};
        }

        const toolId = FUNCTION_TO_TOOL_ID[fnName];
        let resultContent: string;

        if (toolId) {
          const tool = getToolById(toolId);
          if (tool) {
            try {
              const ctx: ToolExecutionContext = {
                sessionId: args.sessionId,
                chatInput: args.chatInput,
                uiContext: args.uiContext,
                traceId: args.traceId,
                apiTrace,
              };
              console.log(`[agent] Ejecutando: ${fnName} → ${toolId}`, fnArgs);
              const toolResult = await tool.execute(fnArgs, ctx);
              toolResults.push(toolResult);
              resultContent = formatToolResultForModel(toolResult);
            } catch (err: any) {
              resultContent = `Error ejecutando ${fnName}: ${err?.message || "Error desconocido"}`;
              console.error(`[agent] Error en ${toolId}:`, err?.message);
            }
          } else {
            resultContent = `Herramienta ${toolId} no encontrada en el registro.`;
          }
        } else {
          resultContent = `Función ${fnName} no reconocida.`;
        }

        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: resultContent,
        });
      }

      // Enviar resultados de tools y continuar el Run
      run = await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
        tool_outputs: toolOutputs,
      });
      continue;
    }

    // Estados de error
    if (
      run.status === "failed" ||
      run.status === "cancelled" ||
      run.status === "expired"
    ) {
      const errorMsg =
        run.last_error?.message || `Run terminó con status: ${run.status}`;

      // Manejo tipo ChatGPT: si revienta TPM, reintentamos y/o rotamos con resumen.
      if (run.status === "failed" && isTpmRateLimitMessage(errorMsg)) {
        const retryAfterMs = parseRetryAfterMs(errorMsg);

        // 1) Reintento rápido (solo una vez) si el mensaje sugiere esperar unos ms.
        if (!didQuickRetry && retryAfterMs !== null) {
          didQuickRetry = true;
          const waitMs = Math.min(2000, retryAfterMs + 80);
          console.warn(
            `[agent] TPM rate limit. Reintentando en ${waitMs}ms...`,
          );
          await sleepMs(waitMs);
          run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId,
          });
          continue;
        }

        // 2) Si persiste, resumimos + rotamos a un thread nuevo y reintentamos (solo una vez).
        if (!didRotateThread) {
          didRotateThread = true;
          console.warn(
            `[agent] TPM persiste. Resumiendo historial y rotando thread...`,
          );
          const summary = await summarizeThreadForRotation(openai, threadId);
          threadId = await rotateThreadWithSummary({
            openai,
            sessionId: args.sessionId,
            summary,
            chatInput: args.chatInput,
            uiContext: args.uiContext,
          });
          run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId,
          });
          continue;
        }
      }

      console.error(`[agent] Run ${run.status}: ${errorMsg}`);
      return {
        output: `Error del asistente: ${errorMsg}. Intenta de nuevo.`,
        toolResults,
        debug: {
          iterations,
          toolsCalled: toolResults.length,
          model: config.openaiModel,
          usage: run.usage ?? null,
          apiTrace,
        },
      };
    }
  }

  // Obtener la respuesta final del thread
  const messages = await openai.beta.threads.messages.list(threadId, {
    order: "desc",
    limit: 1,
  });

  const lastMessage = messages.data[0];
  let output = "No pude generar una respuesta. Intenta de nuevo.";

  if (lastMessage?.role === "assistant" && lastMessage.content.length > 0) {
    const textBlock = lastMessage.content.find((c) => c.type === "text");
    if (textBlock && textBlock.type === "text") {
      output = textBlock.text.value.trim();
    }
  }

  console.log(
    `[agent] Respuesta generada (${iterations} iteraciones, ${toolResults.length} herramientas usadas)`,
  );

  return {
    output,
    toolResults,
    debug: {
      iterations,
      toolsCalled: toolResults.length,
      model: config.openaiModel,
      usage: run.usage ?? null,
      apiTrace,
    },
  };
}

// ── Polling helper ─────────────────────────────────────────────
async function pollRunUntilActionable(
  openai: ReturnType<typeof getOpenAIClient>,
  threadId: string,
  runId: string,
): Promise<Awaited<ReturnType<typeof openai.beta.threads.runs.retrieve>>> {
  const POLL_INTERVAL_MS = 1000;
  const MAX_POLL_TIME_MS = 180_000; // 3 minutos máximo
  const start = Date.now();

  while (true) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);

    if (
      run.status === "completed" ||
      run.status === "requires_action" ||
      run.status === "failed" ||
      run.status === "cancelled" ||
      run.status === "expired"
    ) {
      return run;
    }

    if (Date.now() - start > MAX_POLL_TIME_MS) {
      // Cancelar el run si tarda demasiado
      try {
        await openai.beta.threads.runs.cancel(threadId, runId);
      } catch {
        /* ignore */
      }
      throw new Error(
        "El asistente tardó demasiado en responder (timeout 3min).",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
