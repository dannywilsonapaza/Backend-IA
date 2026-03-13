/**
 * Agent Runner — Function Calling (Chat Completions API)
 *
 * Usa la Chat Completions API con function calling nativo.
 * Compatible con o3 y cualquier modelo de OpenAI.
 * No requiere polling ni Assistants API.
 */
import { createChatCompletion } from "./providers/openai.js";
import type { ChatMessage, ChatTool } from "./providers/openai.js";
import { config } from "../config/env.js";
import { SYSTEM_PROMPT_FC } from "./systemPromptFC.js";
import { getToolById } from "../tools/toolsRegistry.js";
import type { ToolExecutionContext } from "../tools/types.js";
import type { ToolResult, UiContext } from "../types/index.js";

// ── Historial de conversación por sesión ───────────────────────
const sessionHistory = new Map<
  string,
  { messages: ChatMessage[]; updatedAt: number }
>();
const SESSION_TTL_MS = 30 * 60 * 1000;

const cleanupTimer = setInterval(
  () => {
    const now = Date.now();
    for (const [id, s] of sessionHistory) {
      if (now - s.updatedAt > SESSION_TTL_MS) sessionHistory.delete(id);
    }
  },
  5 * 60 * 1000,
);
cleanupTimer.unref();

function getOrCreateHistory(sessionId: string): ChatMessage[] {
  const existing = sessionHistory.get(sessionId);
  if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) {
    existing.updatedAt = Date.now();
    return existing.messages;
  }
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT_FC },
  ];
  sessionHistory.set(sessionId, { messages, updatedAt: Date.now() });
  return messages;
}

// ── Definición de tools para Chat Completions ──────────────────
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
};

const CHAT_TOOLS: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "obtener_detalle",
      description:
        "Obtiene el detalle completo de una cotización: cliente, estado, precio FOB, costo ponderado, markup, estilo Nettalco, estilo cliente, temporada, prendas estimadas, fechas, etc.",
      parameters: {
        type: "object",
        properties: {
          cotizacionId: {
            type: "number",
            description: "ID numérico de la cotización",
          },
        },
        required: ["cotizacionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "obtener_colores",
      description: "Obtiene los colores de una cotización.",
      parameters: {
        type: "object",
        properties: {
          cotizacionId: {
            type: "number",
            description: "ID numérico de la cotización",
          },
        },
        required: ["cotizacionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "obtener_componentes",
      description: "Obtiene los componentes (avíos) de una cotización.",
      parameters: {
        type: "object",
        properties: {
          cotizacionId: {
            type: "number",
            description: "ID numérico de la cotización",
          },
        },
        required: ["cotizacionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_candidatos",
      description:
        "Lista cotizaciones candidatas para comparación histórica por grupo. Llamar PRIMERO antes de comparar KPIs/componentes/minutajes.",
      parameters: {
        type: "object",
        properties: {
          cotizacionId: {
            type: "number",
            description: "ID de la cotización actual",
          },
          grupo: {
            type: "string",
            enum: ["ESTILO_CLIENTE", "ESTILO_NETTALCO", "CLIENTE", "GLOBAL"],
            description: "Grupo de comparación",
          },
        },
        required: ["cotizacionId", "grupo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_kpis",
      description: "Compara KPIs entre dos cotizaciones.",
      parameters: {
        type: "object",
        properties: {
          cotizacionActual: {
            type: "number",
            description: "ID de la cotización actual",
          },
          cotizacionAnterior: {
            type: "number",
            description: "ID de la cotización anterior",
          },
        },
        required: ["cotizacionActual", "cotizacionAnterior"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_componentes",
      description: "Compara componentes entre dos cotizaciones.",
      parameters: {
        type: "object",
        properties: {
          cotizacionActual: {
            type: "number",
            description: "ID de la cotización actual",
          },
          cotizacionAnterior: {
            type: "number",
            description: "ID de la cotización anterior",
          },
        },
        required: ["cotizacionActual", "cotizacionAnterior"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_minutajes",
      description: "Compara minutajes entre dos cotizaciones.",
      parameters: {
        type: "object",
        properties: {
          cotizacionActual: {
            type: "number",
            description: "ID de la cotización actual",
          },
          cotizacionAnterior: {
            type: "number",
            description: "ID de la cotización anterior",
          },
        },
        required: ["cotizacionActual", "cotizacionAnterior"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_cotizacion",
      description:
        "Busca una cotización por ID y devuelve su detalle completo.",
      parameters: {
        type: "object",
        properties: {
          cotizacionId: {
            type: "number",
            description: "ID numérico de la cotización",
          },
        },
        required: ["cotizacionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sugerir_precio",
      description:
        "Analiza la cotización vs históricas y proporciona datos para sugerir un precio FOB óptimo.",
      parameters: {
        type: "object",
        properties: {
          cotizacionId: {
            type: "number",
            description: "ID de la cotización a analizar",
          },
        },
        required: ["cotizacionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_markup",
      description:
        "Calcula markup (%) a partir de precio FOB y costo ponderado.",
      parameters: {
        type: "object",
        properties: {
          precioFob: { type: "number", description: "Precio FOB en dólares" },
          costoPonderado: {
            type: "number",
            description: "Costo ponderado en dólares",
          },
        },
        required: ["precioFob", "costoPonderado"],
      },
    },
  },
];

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

// ── Agente principal (Function Calling) ────────────────────────
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

export async function runAgentFC(args: {
  chatInput: string;
  sessionId: string;
  uiContext?: UiContext;
  traceId: string;
}): Promise<AgentResult> {
  const messages = getOrCreateHistory(args.sessionId);

  // Construir mensaje del usuario con contexto de UI
  let userContent = args.chatInput;
  if (args.uiContext?.cotizacionId) {
    userContent = `[Contexto: el usuario está viendo la cotización #${args.uiContext.cotizacionId}]\n${args.chatInput}`;
  }

  messages.push({ role: "user", content: userContent });

  const toolResults: ToolResult[] = [];
  const apiTrace: any[] = [];
  let iterations = 0;
  let lastUsage: any = null;

  while (iterations < MAX_TOOL_ITERATIONS) {
    // Llamada a la API con Function Calling (modelo o3)
    const completion = await createChatCompletion(
      messages,
      CHAT_TOOLS,
      4000,
      config.openaiModelFC,
    );
    lastUsage = (completion as any).usage ?? null;

    const choice = completion.choices[0];
    const assistantMessage = choice.message;

    // Guardar respuesta del modelo en el historial
    messages.push(assistantMessage as ChatMessage);

    // Si no hay tool_calls, el modelo terminó de responder
    if (
      !assistantMessage.tool_calls ||
      assistantMessage.tool_calls.length === 0
    ) {
      break;
    }

    iterations++;

    // Procesar cada tool_call
    for (const toolCall of assistantMessage.tool_calls) {
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
            console.log(`[agent-fc] Ejecutando: ${fnName} → ${toolId}`, fnArgs);
            const toolResult = await tool.execute(fnArgs, ctx);
            toolResults.push(toolResult);
            resultContent = formatToolResultForModel(toolResult);
          } catch (err: any) {
            resultContent = `Error ejecutando ${fnName}: ${err?.message || "Error desconocido"}`;
            console.error(`[agent-fc] Error en ${toolId}:`, err?.message);
          }
        } else {
          resultContent = `Herramienta ${toolId} no encontrada en el registro.`;
        }
      } else {
        resultContent = `Función ${fnName} no reconocida.`;
      }

      // Agregar resultado al historial como tool message
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: resultContent,
      } as ChatMessage);
    }
  }

  // Extraer respuesta final
  const lastMsg = messages[messages.length - 1];
  let output = "No pude generar una respuesta. Intenta de nuevo.";
  if (lastMsg && "content" in lastMsg && typeof lastMsg.content === "string") {
    output = lastMsg.content.trim();
  }

  // Limitar historial para no exceder contexto (mantener system + últimos 40 mensajes)
  if (messages.length > 42) {
    const system = messages[0];
    const recent = messages.slice(-40);
    messages.length = 0;
    messages.push(system, ...recent);
  }

  console.log(
    `[agent-fc] Respuesta generada (${iterations} iteraciones, ${toolResults.length} herramientas, modelo: ${config.openaiModelFC})`,
  );

  return {
    output,
    toolResults,
    debug: {
      iterations,
      toolsCalled: toolResults.length,
      model: config.openaiModelFC,
      usage: lastUsage,
      apiTrace,
    },
  };
}
