/**
 * Setup script — Crea el Assistant de OpenAI (una sola vez)
 *
 * Ejecutar:  npx tsx scripts/setup-assistant.ts
 *
 * Guarda el assistant_id de salida en tu .env como OPENAI_ASSISTANT_ID.
 */
import "dotenv/config";
import OpenAI from "openai";

const SYSTEM_PROMPT = `# Rol
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

## Flujo de Comparación (IMPORTANTE)
Para CUALQUIER comparación, sigue estos pasos:
1. **Primero** llama \`listar_candidatos(cotizacionId, grupo)\` con el grupo adecuado:
   - ESTILO_CLIENTE: mismo producto/estilo del cliente
   - ESTILO_NETTALCO: mismo estilo Nettalco
   - CLIENTE: cualquier estilo del mismo cliente
   - GLOBAL: toda la base de datos
2. **Luego** usa el ID del mejor candidato sugerido para llamar las comparaciones específicas:
   - \`comparar_kpis(cotActual, cotAnterior)\` → KPIs financieros
   - \`comparar_componentes(cotActual, cotAnterior)\` → avíos y telas
   - \`comparar_minutajes(cotActual, cotAnterior)\` → tiempos de producción
3. Solo llama las comparaciones que el usuario pidió. Si pide "comparar componentes", solo llama listar_candidatos + comparar_componentes.
4. Si el usuario pide una comparación completa o general, llama las 3 (kpis + componentes + minutajes).

- Para sugerir precio, usa \`sugerir_precio\` que ejecuta el análisis completo automáticamente.
- Para calcular markup con valores hipotéticos, usa \`calcular_markup\`.
- Para buscar cualquier cotización por ID, usa \`buscar_cotizacion\`.

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

const TOOLS: OpenAI.Beta.Assistants.AssistantTool[] = [
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

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY no está configurada en .env");
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  console.log("⏳ Creando Assistant en OpenAI...");

  const assistant = await openai.beta.assistants.create({
    name: "Nettalco Cotizaciones Assistant",
    model: "gpt-4o",
    instructions: SYSTEM_PROMPT,
    tools: TOOLS,
  });

  console.log("\n✅ Assistant creado exitosamente!");
  console.log(`   ID: ${assistant.id}`);
  console.log(`   Modelo: ${assistant.model}`);
  console.log(`   Tools: ${assistant.tools.length}`);
  console.log(`\n👉 Agrega esto a tu .env:\n`);
  console.log(`OPENAI_ASSISTANT_ID=${assistant.id}`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
