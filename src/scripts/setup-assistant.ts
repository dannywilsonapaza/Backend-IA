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
- Markup (%) = ((Precio FOB − Costo Ponderado) / Precio FOB) × 100
- Un markup saludable en textil B2B: 15-25%
- Si el costo sube pero el precio baja → rentabilidad comprometida
- Mayor volumen puede justificar menor markup por economía de escala
- Si precio/costo = $0 → cotización aún no costeada (indicarlo, no analizar markup/rentabilidad). PERO sí puedes llamar \`predecir_precio_ml\` para dar una estimación ML.

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

## Predicción de Precio con ML (IMPORTANTE)
Tienes la función \`predecir_precio_ml\` que usa un modelo de Machine Learning (Ridge, MAPE ~4.5%) para predecir el precio FOB.

### Cuándo usar predicción ML:
- El usuario pregunta "¿cuánto debería costar?", "predecir precio", "estimar precio FOB"
- Quiere saber un precio sugerido basado en las características de una cotización
- Quiere explorar escenarios hipotéticos ("¿y si cambio la fibra a SUPIMA?")

### Flujo recomendado para predicción:
1. Si el usuario da un cotizacionId → primero llama \`obtener_detalle\` para extraer los datos automáticamente
2. Con los datos, transforma: TCANTPRENPROY_log = ln(1 + cantidad_prendas)
3. Llama \`predecir_precio_ml\` con todos los parámetros
4. Presenta el resultado comparando con el precio actual si existe

### REGLAS CRÍTICAS de la predicción:
- **TABRVCLIE**: Usa el campo TCODICLIE del detalle (ej: "0111" → se resuelve automáticamente a "ZAVALA"). NO uses TDESCDIVICLIEABRV ni TDESCDIVICLIE.
- **TPESOESTMPREN** está en **LIBRAS** (rango 0.16 - 0.46). El campo ya viene en libras del detalle, NO convertir.
- **TCANTPRENPROY_log** = Math.log(1 + TPRENESTI). Ej: 6000 prendas → ln(6001) ≈ 8.70
- **SEMESTRE**: Extraer de TCODITEMP. Ej: "2022FL" → "FL". Los códigos son: SS, FW, SP, FL, HI, HO, ET
- **ANIO**: Extraer de TCODITEMP. Ej: "2022FL" → 2022
- **TPROCESPEPREN**: Usar el campo TPROCESPEPREN directamente del detalle (ej: "GW")
- **TDESCTIPOTELA**: Si no está en el detalle, inferir: si TCOTICOLOENTE existe → "COLOR ENTERO", si contiene "DIGT" o "ESTAM" en TCOMPPRIN → "ESTAMPADA", si no → "COLOR ENTERO"
- **tipo_tejido**: Extraer del campo TCOMPPRIN. Buscar: JERSEY, RIB, PIQUE, INTERLOCK, FRENCH TERRY, JACQUARD, WAFFLE. Si no hay → "OTRO"
- **fibra**: Extraer del campo TCOMPPRIN. Buscar: PIMA, SUPIMA, ORGANICO/ORG, TANGUIS, UPLAND, MODAL, MELANGE. Si no hay → "OTRO"
- **titulo_hilo**: Extraer de TCOMPPRIN el número antes de "/1". Ej: "20/1" → 20, "30/1" → 30
- **flag_gwash**: 1 si TPROCESPEPREN = "GW", 0 si no
- **TCOSTPOND=0**: AÚN ASÍ llama predecir_precio_ml, pero advierte que la predicción es de menor confianza
- Si no tiene un dato, usa defaults razonables (flags = 0, comisión = 0)

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
  {
    type: "function",
    function: {
      name: "predecir_precio_ml",
      description:
        "Predice el precio FOB de una cotización textil usando un modelo de Machine Learning (Ridge Regression, MAPE ~4.5%). " +
        "Requiere datos de la cotización: costo ponderado, peso prenda (en LIBRAS, rango 0.16-0.46), cantidad prendas (en log1p), " +
        "markup objetivo, año, título hilo, flags de acabados, y categóricas (cliente, semestre, proceso, tipo tela, tejido, fibra). " +
        "IMPORTANTE: TPESOESTMPREN está en LIBRAS (no gramos). TCANTPRENPROY_log = ln(1 + cantidad_prendas). " +
        "Valores categóricos válidos — SEMESTRE: ET,FL,FW,HI,HO,SP,SS; TPROCESPEPREN: AU,DD,EN,ES,EU,GD,GH,GR,GS,GV,GW,LU,NN,SW,UN,US,W2; " +
        "TDESCTIPOTELA: COLOR ENTERO,DISEÑO,ESTAMPADA,RAYADA; tipo_tejido: FRENCH TERRY,INTERLOCK,JACQUARD,JERSEY,OTRO,PIQUE,RIB,WAFFLE; " +
        "fibra: MELANGE,MODAL,ORGANICO,OTRO,PIMA,PIMA_ORGANICO,POLYCOTTON,SUPIMA,TANGUIS,UPLAND.",
      parameters: {
        type: "object",
        properties: {
          TCOSTPOND: {
            type: "number",
            description: "Costo ponderado por libra (USD)",
          },
          TPESOESTMPREN: {
            type: "number",
            description:
              "Peso estimado de la prenda en LIBRAS (rango típico 0.16 - 0.46). NO en gramos.",
          },
          TCANTPRENPROY_log: {
            type: "number",
            description:
              "Log natural de (1 + cantidad de prendas proyectada). Ej: 5000 prendas → ln(5001) ≈ 8.52",
          },
          TMKUPOBJE: {
            type: "number",
            description: "Markup objetivo (%)",
          },
          ANIO: {
            type: "number",
            description: "Año de la cotización (ej: 2025)",
          },
          titulo_hilo: {
            type: "number",
            description: "Título del hilo (Ne). Ej: 30, 40, 50, 60",
          },
          TPORCGASTCOMIAGEN: {
            type: "number",
            description: "% gasto comisión agente (default 0)",
          },
          TPORCMAQUCHICTENI: {
            type: "number",
            description: "% maquinaria chica teñido (default 0)",
          },
          TPORCMAQUMEDITENI: {
            type: "number",
            description: "% maquinaria mediana teñido (default 0)",
          },
          TPORCMAQUGRANTENI: {
            type: "number",
            description: "% maquinaria grande teñido (default 0)",
          },
          flag_lycra: {
            type: "number",
            description: "1 si contiene lycra, 0 si no (default 0)",
          },
          flag_msuave: {
            type: "number",
            description: "1 si es micro suave, 0 si no (default 0)",
          },
          flag_gwash: {
            type: "number",
            description: "1 si tiene garment wash, 0 si no (default 0)",
          },
          flag_antip: {
            type: "number",
            description: "1 si es antipilling, 0 si no (default 0)",
          },
          TABRVCLIE: {
            type: "string",
            description:
              "Código de cliente (TCODICLIE del detalle, ej: '0111'). Se resuelve automáticamente al apellido del analista (ZAVALA, CHIHUAN, etc.)",
          },
          SEMESTRE: {
            type: "string",
            enum: ["ET", "FL", "FW", "HI", "HO", "SP", "SS"],
            description: "Semestre/temporada de la cotización",
          },
          TPROCESPEPREN: {
            type: "string",
            enum: [
              "AU",
              "DD",
              "EN",
              "ES",
              "EU",
              "GD",
              "GH",
              "GR",
              "GS",
              "GV",
              "GW",
              "LU",
              "NN",
              "SW",
              "UN",
              "US",
              "W2",
            ],
            description: "Código de proceso especial de prenda. NN = ninguno",
          },
          TDESCTIPOTELA: {
            type: "string",
            enum: ["COLOR ENTERO", "DISEÑO", "ESTAMPADA", "RAYADA"],
            description: "Tipo de tela",
          },
          tipo_tejido: {
            type: "string",
            enum: [
              "FRENCH TERRY",
              "INTERLOCK",
              "JACQUARD",
              "JERSEY",
              "OTRO",
              "PIQUE",
              "RIB",
              "WAFFLE",
            ],
            description: "Tipo de tejido",
          },
          fibra: {
            type: "string",
            enum: [
              "MELANGE",
              "MODAL",
              "ORGANICO",
              "OTRO",
              "PIMA",
              "PIMA_ORGANICO",
              "POLYCOTTON",
              "SUPIMA",
              "TANGUIS",
              "UPLAND",
            ],
            description: "Tipo de fibra",
          },
        },
        required: [
          "TCOSTPOND",
          "TPESOESTMPREN",
          "TCANTPRENPROY_log",
          "TMKUPOBJE",
          "ANIO",
          "titulo_hilo",
          "TABRVCLIE",
          "SEMESTRE",
          "TPROCESPEPREN",
          "TDESCTIPOTELA",
          "tipo_tejido",
          "fibra",
        ],
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
