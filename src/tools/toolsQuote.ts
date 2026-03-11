import type { ToolDefinition } from "./types.js";
import type { ToolResult } from "../types/index.js";
import {
  getColoresCotizacion,
  getComponentesCotizacion,
  getDetalleCotizacion,
} from "./backendPrincipalApi.js";
import {
  ejecutarComparacionCompleta,
  compararKPIs,
} from "../services/comparacionService.js";

function pickCotizacionId(params: Record<string, any>): number | null {
  const raw = params.cotizacionId ?? params.tcodicoti ?? null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export const quoteDetailTool: ToolDefinition = {
  id: "quote.detail",
  description:
    "Obtiene el detalle completo de una cotización (gestión/detalle).",
  requiredParams: ["cotizacionId"],
  examples: ["216881", "detalle de la cotización 216881"],
  execute: async (params, ctx): Promise<ToolResult> => {
    const cotizacionId = pickCotizacionId(params);
    if (!cotizacionId) {
      return {
        intent: "quote.detail",
        entities: { cotizacionId: null },
        artifacts: [
          {
            type: "warning",
            title: "Falta cotizacionId",
            data: { message: "Necesito el ID de la cotización." },
          },
        ],
      };
    }

    const result = await getDetalleCotizacion(cotizacionId, ctx.apiTrace);
    if (!result.success) {
      return {
        intent: "quote.detail",
        entities: { cotizacionId },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando detalle",
            data: { message: result.message ?? "Error al obtener detalle." },
          },
        ],
      };
    }

    const d0 = Array.isArray((result as any).data?.data)
      ? (result as any).data.data[0]
      : ((result as any).data?.[0] ?? (result as any).data);

    const facts =
      d0 && typeof d0 === "object"
        ? { ...d0, TCODICOTI: d0.TCODICOTI ?? cotizacionId }
        : { TCODICOTI: cotizacionId };

    return {
      intent: "quote.detail",
      entities: { cotizacionId },
      artifacts: [
        {
          type: "facts",
          title: "Detalle de cotización (completo)",
          data: facts,
        },
      ],
    };
  },
};

export const quoteColorsTool: ToolDefinition = {
  id: "quote.colors",
  description: "Obtiene los colores asociados a una cotización.",
  requiredParams: ["cotizacionId"],
  examples: ["colores de 216833", "mostrar colores cotización 216833"],
  execute: async (params, ctx): Promise<ToolResult> => {
    const cotizacionId = pickCotizacionId(params);
    if (!cotizacionId) {
      return {
        intent: "quote.colors",
        entities: { cotizacionId: null },
        artifacts: [
          {
            type: "warning",
            title: "Falta cotizacionId",
            data: { message: "Necesito el ID de la cotización." },
          },
        ],
      };
    }

    const result = await getColoresCotizacion(cotizacionId, ctx.apiTrace);
    if (!result.success) {
      return {
        intent: "quote.colors",
        entities: { cotizacionId },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando colores",
            data: { message: result.message ?? "Error al obtener colores." },
          },
        ],
      };
    }

    const colores = (result.data ?? []) as any[];
    const rows = colores.slice(0, 200);

    return {
      intent: "quote.colors",
      entities: { cotizacionId },
      artifacts: [
        {
          type: "table",
          title: `Colores de la cotización ${cotizacionId}`,
          data: { rows, total: colores.length },
        },
      ],
      limits:
        colores.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

export const quoteComponentsTool: ToolDefinition = {
  id: "quote.components",
  description: "Obtiene los componentes asociados a una cotización.",
  requiredParams: ["cotizacionId"],
  examples: ["componentes 216833", "componentes de la cotización 216833"],
  execute: async (params, ctx): Promise<ToolResult> => {
    const cotizacionId = pickCotizacionId(params);
    if (!cotizacionId) {
      return {
        intent: "quote.components",
        entities: { cotizacionId: null },
        artifacts: [
          {
            type: "warning",
            title: "Falta cotizacionId",
            data: { message: "Necesito el ID de la cotización." },
          },
        ],
      };
    }

    const result = await getComponentesCotizacion(cotizacionId, ctx.apiTrace);
    if (!result.success) {
      return {
        intent: "quote.components",
        entities: { cotizacionId },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando componentes",
            data: {
              message: result.message ?? "Error al obtener componentes.",
            },
          },
        ],
      };
    }

    const componentes = (result.data ?? []) as any[];
    const rows = componentes.slice(0, 60);

    const countsByTipo: Record<string, number> = {};
    for (const row of rows) {
      const k = (row.TDESCTIPOCOMP ?? row.TTIPOCOMP ?? "N/A").toString().trim();
      countsByTipo[k] = (countsByTipo[k] ?? 0) + 1;
    }

    return {
      intent: "quote.components",
      entities: { cotizacionId },
      artifacts: [
        {
          type: "facts",
          title: `Componentes (resumen) - cotización ${cotizacionId}`,
          data: { total: componentes.length, porTipo: countsByTipo },
        },
        {
          type: "table",
          title: `Componentes de la cotización ${cotizacionId}`,
          data: { rows, total: componentes.length },
        },
      ],
      limits:
        componentes.length > 60
          ? { truncated: true, reason: "Se recortó a 60 filas" }
          : undefined,
    };
  },
};

// HELPER COMPARISON TOOL EXECUTOR
async function executeComparisonTool(
  params: any,
  ctx: any,
  grupo: "ESTILO_CLIENTE" | "CLIENTE" | "GLOBAL",
  intent: string,
): Promise<ToolResult> {
  const cotizacionId = pickCotizacionId(params);
  if (!cotizacionId) {
    return {
      intent,
      entities: { cotizacionId: null },
      artifacts: [
        {
          type: "warning",
          title: "Falta cotizacionId",
          data: { message: "Necesito el ID de la cotización." },
        },
      ],
    };
  }

  const comparacion = await ejecutarComparacionCompleta(cotizacionId, grupo);

  if (!comparacion.success || !comparacion.kpis) {
    return {
      intent,
      entities: { cotizacionId },
      artifacts: [
        {
          type: "warning",
          title: "Comparación no disponible",
          data: {
            message:
              comparacion.error ||
              "No se pudieron calcular los KPIs para esta cotización.",
          },
        },
      ],
    };
  }

  // Formatting as facts and table just like the frontend expects
  const kpis = comparacion.kpis;
  const tableData = [
    {
      Indicador: "Precio FOB",
      Actual: kpis.cotizacionActual.precioFob ?? "N/D",
      Anterior: kpis.cotizacionAnterior.precioFob ?? "N/D",
      Diferencia: kpis.diferencias.precioFob ?? "N/D",
    },
    {
      Indicador: "Costo Ponderado",
      Actual: kpis.cotizacionActual.costoPonderado ?? "N/D",
      Anterior: kpis.cotizacionAnterior.costoPonderado ?? "N/D",
      Diferencia: kpis.diferencias.costoPonderado ?? "N/D",
    },
    {
      Indicador: "Markup",
      Actual: kpis.cotizacionActual.markup ?? "N/D",
      Anterior: kpis.cotizacionAnterior.markup ?? "N/D",
      Diferencia: kpis.diferencias.markup ?? "N/D",
    },
    {
      Indicador: "Prendas Est.",
      Actual: kpis.cotizacionActual.prendasEstimadas ?? "N/D",
      Anterior: kpis.cotizacionAnterior.prendasEstimadas ?? "N/D",
      Diferencia: kpis.diferencias.prendasEstimadas ?? "N/D",
    },
  ];

  return {
    intent,
    entities: { cotizacionId },
    artifacts: [
      {
        type: "facts",
        title: `Resumen de Comparación (${grupo})`,
        data: {
          "Cotización Actual": kpis.cotizacionActual.temporada,
          "Cotización Base": `${comparacion.candidatoSeleccionado?.COTIZACION_ID} (${kpis.cotizacionAnterior.temporada})`,
          "Total Candidatos Evaluados": comparacion.totalCandidatos,
        },
      },
      {
        type: "table",
        title: "Comparación de KPIs",
        data: { rows: tableData, total: 4 },
      },
      ...(comparacion.componentes && comparacion.componentes.length > 0
        ? [
            {
              type: "table" as const,
              title: `Comparación de Componentes (vs #${comparacion.candidatoSeleccionado?.COTIZACION_ID})`,
              data: {
                rows: comparacion.componentes,
                total: comparacion.componentes.length,
              },
            },
          ]
        : []),
      ...(comparacion.minutajes && comparacion.minutajes.length > 0
        ? [
            {
              type: "table" as const,
              title: `Comparación de Minutajes (vs #${comparacion.candidatoSeleccionado?.COTIZACION_ID})`,
              data: {
                rows: comparacion.minutajes,
                total: comparacion.minutajes.length,
              },
            },
          ]
        : []),
    ],
  };
}

export const quoteCompareClientTool: ToolDefinition = {
  id: "quote.compare.client",
  description:
    "Compara los KPIs de la cotización actual con otras cotizaciones históricas del MISMO CLIENTE.",
  requiredParams: ["cotizacionId"],
  examples: [
    "compara kpis con el mismo cliente para 217442",
    "busca cotizaciones similares del cliente para la 217442",
    "comparación cliente 217442",
  ],
  execute: async (params, ctx) =>
    executeComparisonTool(params, ctx, "CLIENTE", "quote.compare.client"),
};

export const quoteCompareStyleTool: ToolDefinition = {
  id: "quote.compare.style",
  description:
    "Compara los KPIs de la cotización actual con otras cotizaciones históricas que compartan EXACTAMENTE EL MISMO ESTILO del cliente.",
  requiredParams: ["cotizacionId"],
  examples: [
    "compara kpis del mismo estilo para la 217442",
    "busca cotizaciones con el mismo estilo de la 217442",
    "comparación estilo 217442",
  ],
  execute: async (params, ctx) =>
    executeComparisonTool(params, ctx, "ESTILO_CLIENTE", "quote.compare.style"),
};

export const quoteCompareGlobalTool: ToolDefinition = {
  id: "quote.compare.global",
  description:
    "Compara los KPIs de la cotización actual con otras cotizaciones históricas A NIVEL GLOBAL (toda la base de datos).",
  requiredParams: ["cotizacionId"],
  examples: [
    "compara kpis a nivel global de la 217442",
    "búsqueda inteligente global para la 217442",
    "comparación global 217442",
  ],
  execute: async (params, ctx) =>
    executeComparisonTool(params, ctx, "GLOBAL", "quote.compare.global"),
};

export const quoteCompareTwoTool: ToolDefinition = {
  id: "quote.compare.two",
  description:
    "Compara los KPIs y costos financieros entre DOS cotizaciones ESPECÍFICAS proporcionando ambos IDs.",
  requiredParams: ["cotizacionA", "cotizacionB"],
  examples: [
    "compara los costos de la cotizacion 217442 y 214864",
    "diferencias kpis entre 217442 y 214864",
    "comparar 217442 vs 214864",
  ],
  execute: async (params, ctx) => {
    const cotA = Number(params.cotizacionA);
    const cotB = Number(params.cotizacionB);

    if (!Number.isFinite(cotA) || !Number.isFinite(cotB)) {
      return {
        intent: "quote.compare.two",
        entities: {
          cotizacionA: params.cotizacionA,
          cotizacionB: params.cotizacionB,
        },
        artifacts: [
          {
            type: "warning",
            title: "Faltan IDs",
            data: { message: "Necesito los IDs de ambas cotizaciones." },
          },
        ],
      };
    }

    const comparacion = await compararKPIs(cotA, cotB);

    if (!comparacion.success || !comparacion.data) {
      return {
        intent: "quote.compare.two",
        entities: { cotizacionA: cotA, cotizacionB: cotB },
        artifacts: [
          {
            type: "warning",
            title: "Comparación no disponible",
            data: {
              message:
                comparacion.error ||
                "No se pudieron comparar los KPIs para estas cotizaciones.",
            },
          },
        ],
      };
    }

    const kpis = comparacion.data;
    const tableData = [
      {
        Indicador: "Precio FOB",
        Actual: kpis.cotizacionActual.precioFob ?? "N/D",
        Anterior: kpis.cotizacionAnterior.precioFob ?? "N/D",
        Diferencia: kpis.diferencias.precioFob ?? "N/D",
      },
      {
        Indicador: "Costo Ponderado",
        Actual: kpis.cotizacionActual.costoPonderado ?? "N/D",
        Anterior: kpis.cotizacionAnterior.costoPonderado ?? "N/D",
        Diferencia: kpis.diferencias.costoPonderado ?? "N/D",
      },
      {
        Indicador: "Markup",
        Actual: kpis.cotizacionActual.markup ?? "N/D",
        Anterior: kpis.cotizacionAnterior.markup ?? "N/D",
        Diferencia: kpis.diferencias.markup ?? "N/D",
      },
      {
        Indicador: "Prendas Est.",
        Actual: kpis.cotizacionActual.prendasEstimadas ?? "N/D",
        Anterior: kpis.cotizacionAnterior.prendasEstimadas ?? "N/D",
        Diferencia: kpis.diferencias.prendasEstimadas ?? "N/D",
      },
    ];

    return {
      intent: "quote.compare.two",
      entities: { cotizacionA: cotA, cotizacionB: cotB },
      artifacts: [
        {
          type: "facts",
          title: `Comparación Directa de KPIs`,
          data: {
            "Cotización Actual (A)": `${cotA} (${kpis.cotizacionActual.temporada})`,
            "Cotización Base (B)": `${cotB} (${kpis.cotizacionAnterior.temporada})`,
          },
        },
        {
          type: "table",
          title: "Comparación de KPIs",
          data: { rows: tableData, total: 4 },
        },
      ],
    };
  },
};
