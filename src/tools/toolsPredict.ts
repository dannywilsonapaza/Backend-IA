import type { ToolDefinition } from "./types.js";
import type { ToolResult } from "../types/index.js";
import { predictPrecioFob } from "./mlApi.js";
import type { MlPredictRequest } from "./mlApi.js";

// Mapeo TCODICLIE → TABRVCLIE (del dataset de entrenamiento)
const CLIENT_MAP: Record<number, string> = {
  1: "GALARZA",
  2: "CHIPANA",
  6: "BLAS",
  9: "COTERA",
  13: "VELEZ",
  17: "CORIMAYHUA",
  19: "VALLEJOS",
  22: "CCELLCCASC",
  28: "CARBAJAL",
  30: "GUTIERREZ",
  32: "LIMAS",
  111: "ZAVALA",
  113: "PORTUGUEZ",
  234: "CHIHUAN",
  266: "SILVA",
  371: "PRADO",
  373: "GOMEZ",
  387: "SANCHEZ",
  388: "AMAO",
  404: "QUIROGA",
  1105: "JARA",
  1106: "PACHECO",
  1107: "ESPINOZA",
  1157: "TALLEDO",
  1504: "SANTIAGO",
  2023: "CASTILLO",
  2053: "ALIAGA",
  4003: "BARRENECHE",
  5005: "SAAVEDRA",
  5010: "SOLANO",
  5555: "BALBOA",
  6000: "PALACIOS",
  6666: "HUERTA",
  8888: "OSCCO",
};

const VALID_CLIENTS = new Set(Object.values(CLIENT_MAP));

function resolveClient(value: string | number): string {
  // Si es un código numérico, buscar en el mapeo
  const num = Number(value);
  if (!isNaN(num) && CLIENT_MAP[num]) return CLIENT_MAP[num];
  // Si es un string que es un código con ceros (ej: "0111")
  const stripped = String(value).replace(/^0+/, "");
  const num2 = Number(stripped);
  if (!isNaN(num2) && CLIENT_MAP[num2]) return CLIENT_MAP[num2];
  // Si ya es un TABRVCLIE válido
  const upper = String(value).toUpperCase().trim();
  if (VALID_CLIENTS.has(upper)) return upper;
  // Devolver tal cual (el modelo manejará el valor desconocido)
  return upper;
}

const REQUIRED_NUMERIC = [
  "TCOSTPOND",
  "TPESOESTMPREN",
  "TCANTPRENPROY_log",
  "TMKUPOBJE",
  "ANIO",
  "titulo_hilo",
] as const;

const OPTIONAL_NUMERIC: Record<string, number> = {
  TPORCGASTCOMIAGEN: 0,
  TPORCMAQUCHICTENI: 0,
  TPORCMAQUMEDITENI: 0,
  TPORCMAQUGRANTENI: 0,
  flag_lycra: 0,
  flag_msuave: 0,
  flag_gwash: 0,
  flag_antip: 0,
};

const REQUIRED_CATEGORICAL = [
  "TABRVCLIE",
  "SEMESTRE",
  "TPROCESPEPREN",
  "TDESCTIPOTELA",
  "tipo_tejido",
  "fibra",
] as const;

export const quotePredictPriceTool: ToolDefinition = {
  id: "quote.predict.price",
  description:
    "Predice el precio FOB de una cotización textil usando el modelo ML (Ridge). " +
    "Requiere features numéricas (costo ponderado, peso prenda en libras, cantidad prendas en log1p, markup objetivo, año, título hilo) " +
    "y categóricas (cliente, semestre, proceso especial, tipo tela, tipo tejido, fibra).",
  requiredParams: [...REQUIRED_NUMERIC, ...REQUIRED_CATEGORICAL],
  examples: [
    "predecir precio cotización con costo 4.5, peso 0.24 lbs, 5000 prendas, markup 20%",
    "¿cuánto debería ser el precio FOB para PIMA JERSEY con costo ponderado 5.2?",
  ],
  execute: async (params, ctx): Promise<ToolResult> => {
    // Validar numéricos requeridos
    const missing: string[] = [];
    for (const key of REQUIRED_NUMERIC) {
      if (params[key] === undefined || params[key] === null) {
        missing.push(key);
      }
    }
    for (const key of REQUIRED_CATEGORICAL) {
      if (!params[key]) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      return {
        intent: "quote.predict.price",
        entities: {},
        artifacts: [
          {
            type: "warning",
            title: "Faltan parámetros",
            data: {
              message: `Faltan parámetros requeridos: ${missing.join(", ")}`,
              parametros_faltantes: missing,
            },
          },
        ],
      };
    }

    // Construir payload con defaults para opcionales
    const resolvedClient = resolveClient(params.TABRVCLIE);
    const warnings: string[] = [];

    if (!VALID_CLIENTS.has(resolvedClient)) {
      warnings.push(
        `Cliente "${params.TABRVCLIE}" no reconocido en el modelo. La predicción puede ser menos precisa.`,
      );
    }

    if (Number(params.TCOSTPOND) === 0) {
      warnings.push(
        "TCOSTPOND es $0 (cotización no costeada). La predicción tiene MENOR CONFIANZA porque el costo ponderado es la variable más importante del modelo.",
      );
    }

    const body: MlPredictRequest = {
      TCOSTPOND: Number(params.TCOSTPOND),
      TPESOESTMPREN: Number(params.TPESOESTMPREN),
      TPORCGASTCOMIAGEN: Number(
        params.TPORCGASTCOMIAGEN ?? OPTIONAL_NUMERIC.TPORCGASTCOMIAGEN,
      ),
      TCANTPRENPROY_log: Number(params.TCANTPRENPROY_log),
      TMKUPOBJE: Number(params.TMKUPOBJE),
      TPORCMAQUCHICTENI: Number(
        params.TPORCMAQUCHICTENI ?? OPTIONAL_NUMERIC.TPORCMAQUCHICTENI,
      ),
      TPORCMAQUMEDITENI: Number(
        params.TPORCMAQUMEDITENI ?? OPTIONAL_NUMERIC.TPORCMAQUMEDITENI,
      ),
      TPORCMAQUGRANTENI: Number(
        params.TPORCMAQUGRANTENI ?? OPTIONAL_NUMERIC.TPORCMAQUGRANTENI,
      ),
      ANIO: Number(params.ANIO),
      titulo_hilo: Number(params.titulo_hilo),
      flag_lycra: Number(params.flag_lycra ?? OPTIONAL_NUMERIC.flag_lycra),
      flag_msuave: Number(params.flag_msuave ?? OPTIONAL_NUMERIC.flag_msuave),
      flag_gwash: Number(params.flag_gwash ?? OPTIONAL_NUMERIC.flag_gwash),
      flag_antip: Number(params.flag_antip ?? OPTIONAL_NUMERIC.flag_antip),
      TABRVCLIE: resolvedClient,
      SEMESTRE: String(params.SEMESTRE),
      TPROCESPEPREN: String(params.TPROCESPEPREN),
      TDESCTIPOTELA: String(params.TDESCTIPOTELA),
      tipo_tejido: String(params.tipo_tejido),
      fibra: String(params.fibra),
    };

    const result = await predictPrecioFob(body, ctx.apiTrace);

    if (!result.success || !result.data) {
      return {
        intent: "quote.predict.price",
        entities: { params: body },
        artifacts: [
          {
            type: "warning",
            title: "Error en predicción ML",
            data: {
              message:
                result.message ?? "No se pudo obtener predicción del modelo.",
            },
          },
        ],
      };
    }

    const { precio_fob_predicho, modelo, confianza } = result.data;

    const artifacts: ToolResult["artifacts"] = [];

    // Agregar warnings si existen
    if (warnings.length > 0) {
      artifacts.push({
        type: "warning",
        title: "Advertencias de predicción",
        data: { message: warnings.join(" | ") },
      });
    }

    artifacts.push({
      type: "kpi",
      title: "Predicción de Precio FOB (ML)",
      data: {
        precio_fob_predicho,
        modelo,
        confianza: warnings.length > 0 ? "baja (datos incompletos)" : confianza,
        costo_ponderado: body.TCOSTPOND,
        cliente_resuelto: resolvedClient,
        markup_estimado:
          body.TCOSTPOND > 0
            ? `${(((precio_fob_predicho - body.TCOSTPOND) / body.TCOSTPOND) * 100).toFixed(1)}%`
            : "N/D (sin costo ponderado)",
      },
    });

    return {
      intent: "quote.predict.price",
      entities: {
        TCOSTPOND: body.TCOSTPOND,
        TABRVCLIE: resolvedClient,
        tipo_tejido: body.tipo_tejido,
        fibra: body.fibra,
      },
      artifacts,
    };
  },
};
