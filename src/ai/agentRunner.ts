/**
 * Agent Runner — Motor de Function Calling de OpenAI
 *
 * Reemplaza la heurística manual (selectTool) por function calling nativo.
 * El modelo decide qué herramienta usar, extrae parámetros, y genera la
 * respuesta final con los datos reales.
 */
import {
  createChatCompletion,
  type ChatMessage,
  type ChatTool,
} from "./providers/openai.js";
import { getToolById } from "../tools/toolsRegistry.js";
import type { ToolExecutionContext } from "../tools/types.js";
import type { ToolResult, UiContext } from "../types/index.js";

// ── Historial de conversación por sesión ───────────────────────
type SessionHistory = { messages: ChatMessage[]; updatedAt: number };
const sessions = new Map<string, SessionHistory>();
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_MESSAGES = 40;

function getHistory(sessionId: string): ChatMessage[] {
  const s = sessions.get(sessionId);
  if (s && Date.now() - s.updatedAt < SESSION_TTL_MS) return [...s.messages];
  sessions.delete(sessionId);
  return [];
}

function saveHistory(sessionId: string, messages: ChatMessage[]): void {
  const trimmed =
    messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;
  sessions.set(sessionId, { messages: trimmed, updatedAt: Date.now() });
}

// Limpieza periódica de sesiones expiradas
const cleanupTimer = setInterval(
  () => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
    }
  },
  5 * 60 * 1000,
);
cleanupTimer.unref();

// ── System Prompt del Agente ───────────────────────────────────
const AGENT_SYSTEM_PROMPT = `# Rol
Eres el asistente experto de cotizaciones textiles de **Nettalco SA**. Responde siempre en español.

# Conocimiento de Negocio
- Markup (%) = ((Precio FOB − Costo Ponderado) / Costo Ponderado) × 100
- Un markup saludable en textil B2B: 15-25%
- Si el costo sube pero el precio baja → rentabilidad comprometida
- Mayor volumen puede justificar menor markup por economía de escala
- Si precio/costo = $0 → cotización aún no costeada (indicarlo, no analizar números)

# Herramientas
Tienes funciones para consultar datos reales del sistema. Úsalas siempre que necesites datos concretos.
- Si el usuario está viendo una cotización (cotizacionId en el contexto), úsala directamente SIN preguntar el ID.
- Si NO hay cotizacionId en el contexto y el usuario no lo menciona, pídelo amablemente.
- Puedes encadenar varias herramientas si el usuario pide un análisis completo.

# Formato de Respuesta
- Español, conciso, máximo 10 líneas para respuestas normales.
- Para **comparaciones de KPIs** usa EXACTAMENTE este formato:

📊 **Comparación por [Estilo Cliente / Cliente / Global]**

🔍 Se encontraron **X cotizaciones** de temporadas anteriores.
✅ Se seleccionó la cotización **#ID (TEMPORADA)** como la más relevante.

📈 **Comparación de KPIs:**

| Indicador | Actual | Anterior | Diferencia |
|-----------|--------|----------|------------|
| **Precio FOB** | $X.XX | $X.XX | +/-$X.XX |
| **Costo Ponderado** | $X.XX | $X.XX | +/-$X.XX |
| **Markup** | X.X% | X.X% | +/-X.X pts |
| **Prendas Est.** | X | X | +/-X |

💡 **Análisis:** [máximo 3 oraciones, justifica técnicamente las variaciones]

- Para **dato específico** (ej. "¿cuál es el costo?"): 1-2 líneas, SOLO ese dato.
- Para **detalle/resumen**: lista con viñetas de todos los campos.
- Para **colores/componentes**: tabla o lista resumida (máx 10 ítems, indicar total).

# Restricciones
- Solo responde sobre cotizaciones y temas de la empresa.
- Nunca inventes datos. Si algo no está disponible muestra "N/D".
- No menciones que eres un modelo de IA.`;

// ── Definición de herramientas para OpenAI ─────────────────────
const AGENT_TOOLS: ChatTool[] = [
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
      description:
        "Obtiene los colores de una cotización: tipo, nombre, número, porcentaje de participación y tono.",
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
      description:
        "Obtiene los componentes (avíos) de una cotización: telas, hilos, botones, cierres, etc. Incluye tipo, descripción, ítem y consumo neto.",
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
      name: "comparar_por_estilo_cliente",
      description:
        "Compara KPIs, minutajes y componentes de la cotización con cotizaciones históricas del MISMO ESTILO del cliente. Ideal para ver evolución del mismo producto.",
      parameters: {
        type: "object",
        properties: {
          cotizacionId: {
            type: "number",
            description: "ID de la cotización actual",
          },
        },
        required: ["cotizacionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_por_cliente",
      description:
        "Compara KPIs de la cotización con todas las cotizaciones históricas del MISMO CLIENTE (cualquier estilo). Útil para ver rangos de precios con ese cliente.",
      parameters: {
        type: "object",
        properties: {
          cotizacionId: {
            type: "number",
            description: "ID de la cotización actual",
          },
        },
        required: ["cotizacionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_global",
      description:
        "Compara KPIs de la cotización con TODAS las cotizaciones históricas de la base de datos (cualquier cliente/estilo). Da una visión general del mercado.",
      parameters: {
        type: "object",
        properties: {
          cotizacionId: {
            type: "number",
            description: "ID de la cotización actual",
          },
        },
        required: ["cotizacionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_dos_cotizaciones",
      description:
        "Compara directamente los KPIs entre DOS cotizaciones específicas proporcionando ambos IDs.",
      parameters: {
        type: "object",
        properties: {
          cotizacionA: {
            type: "number",
            description: "ID de la primera cotización",
          },
          cotizacionB: {
            type: "number",
            description: "ID de la segunda cotización",
          },
        },
        required: ["cotizacionA", "cotizacionB"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_colores",
      description:
        "Compara los colores entre dos cotizaciones: muestra los comunes, los exclusivos de cada una y las diferencias.",
      parameters: {
        type: "object",
        properties: {
          cotizacionA: {
            type: "number",
            description: "ID de la primera cotización",
          },
          cotizacionB: {
            type: "number",
            description: "ID de la segunda cotización",
          },
        },
        required: ["cotizacionA", "cotizacionB"],
      },
    },
  },
];

// Mapeo: nombre de función OpenAI → tool ID interno
const FUNCTION_TO_TOOL_ID: Record<string, string> = {
  obtener_detalle: "quote.detail",
  obtener_colores: "quote.colors",
  obtener_componentes: "quote.components",
  comparar_por_estilo_cliente: "quote.compare.style",
  comparar_por_cliente: "quote.compare.client",
  comparar_global: "quote.compare.global",
  comparar_dos_cotizaciones: "quote.compare.two",
  comparar_colores: "compare.colors",
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

// ── Agente principal ───────────────────────────────────────────
const MAX_TOOL_ITERATIONS = 3;

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
  const history = getHistory(args.sessionId);

  // Inyectar contexto de UI como parte del mensaje del usuario
  let userContent = args.chatInput;
  if (args.uiContext?.cotizacionId) {
    userContent = `[Contexto: el usuario está viendo la cotización #${args.uiContext.cotizacionId}]\n${args.chatInput}`;
  }
  history.push({ role: "user", content: userContent });

  // Construir mensajes completos (system + historial)
  const buildMessages = (): ChatMessage[] => [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    ...history,
  ];

  const toolResults: ToolResult[] = [];
  const apiTrace: any[] = [];
  let iterations = 0;

  // Primera llamada
  let response = await createChatCompletion(buildMessages(), AGENT_TOOLS, 2000);
  let choice = response.choices[0];

  // Loop de function calling
  while (
    choice.message.tool_calls &&
    choice.message.tool_calls.length > 0 &&
    iterations < MAX_TOOL_ITERATIONS
  ) {
    iterations++;

    // Agregar mensaje del asistente (con tool_calls) al historial
    history.push({
      role: "assistant",
      content: choice.message.content ?? null,
      tool_calls: choice.message.tool_calls,
    } as ChatMessage);

    // Ejecutar cada tool call
    for (const toolCall of choice.message.tool_calls) {
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

      // Agregar resultado al historial
      history.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: resultContent,
      } as ChatMessage);
    }

    // Siguiente llamada con los resultados de las herramientas
    response = await createChatCompletion(buildMessages(), AGENT_TOOLS, 2000);
    choice = response.choices[0];
  }

  // Respuesta final del modelo
  const output =
    choice.message?.content?.trim() ||
    "No pude generar una respuesta. Intenta de nuevo.";

  // Guardar respuesta en historial
  history.push({ role: "assistant", content: output });
  saveHistory(args.sessionId, history);

  console.log(
    `[agent] Respuesta generada (${iterations} iteraciones, ${toolResults.length} herramientas usadas)`,
  );

  return {
    output,
    toolResults,
    debug: {
      iterations,
      toolsCalled: toolResults.length,
      model: response.model ?? "",
      usage: response.usage ?? null,
      apiTrace,
    },
  };
}
