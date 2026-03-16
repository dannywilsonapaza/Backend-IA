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

// ── Mapeo de funciones OpenAI → tool ID interno ────────────────
const FUNCTION_TO_TOOL_ID: Record<string, string> = {
  obtener_detalle: "quote.detail",
  obtener_colores: "quote.colors",
  obtener_componentes: "quote.components",
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

  const threadId = await getOrCreateThread(args.sessionId);

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
