import type { ToolDefinition } from "./types.js";
import type { ToolResult } from "../types/index.js";
import {
  getColoresCotizacion,
  getComponentesCotizacion,
  getDetalleCotizacion,
  getDescriptoresEstiloNettalco,
  getDimensionesEstiloNettalco,
  getExtrasCotizacion,
  getExtrasRubros,
  getHiladosPorColorCotizacion,
  getHiladosPorColorItems,
  getHiladosPorColorColores,
  getHiladosEspecialesCotizacion,
  getHiladosEspecialesItems,
  getMinutajesCotizacion,
  getMinutajesCodigos,
  getListaMinutajesCliente,
} from "./backendPrincipalApi.js";
import {
  obtenerCandidatos,
  compararKPIs,
  compararMinutajes,
  compararComponentes,
  ejecutarComparacionCompleta,
  seleccionarMejorCandidato,
} from "../services/comparacionService.js";

function pickCotizacionId(params: Record<string, any>): number | null {
  const raw = params.cotizacionId ?? params.tcodicoti ?? null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function pickNonEmptyString(
  params: Record<string, any>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = params?.[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

async function tryGetDetalleFromUiContext(ctx: any): Promise<any | null> {
  const uiCotIdRaw = ctx?.uiContext?.cotizacionId;
  const cotId = Number(uiCotIdRaw);
  if (!Number.isFinite(cotId) || cotId <= 0) return null;
  const detalleResult = await getDetalleCotizacion(cotId, ctx.apiTrace);
  if (!detalleResult.success) return null;

  const d0 = Array.isArray((detalleResult as any).data?.data)
    ? (detalleResult as any).data.data[0]
    : ((detalleResult as any).data?.[0] ?? (detalleResult as any).data);
  return d0 && typeof d0 === "object" ? d0 : null;
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

// ── TOOL: Descriptores por Estilo Nettalco ────────────────────
export const quoteDescriptoresEstiloNettalcoTool: ToolDefinition = {
  id: "quote.descriptores.estiloNettalco",
  description:
    "Obtiene descriptores del estilo Nettalco (elementos) por TCODIESTINETT.",
  requiredParams: ["tcodiestinett"],
  examples: [
    "descriptores estilo nettalco E12345",
    "descriptores del estilo nettalco para la cotización 216881",
  ],
  execute: async (params, ctx): Promise<ToolResult> => {
    let tcodiestinett = pickNonEmptyString(params, [
      "tcodiestinett",
      "TCODIESTINETT",
      "estiloNettalco",
    ]);

    if (!tcodiestinett) {
      const d0 = await tryGetDetalleFromUiContext(ctx);
      tcodiestinett =
        typeof d0?.TCODIESTINETT === "string" ? d0.TCODIESTINETT.trim() : null;
    }

    if (!tcodiestinett) {
      return {
        intent: "quote.descriptores.estiloNettalco",
        entities: { tcodiestinett: null },
        artifacts: [
          {
            type: "warning",
            title: "Falta TCODIESTINETT",
            data: {
              message:
                "Necesito el código de Estilo Nettalco (TCODIESTINETT) o que el usuario esté viendo una cotización con ese dato.",
            },
          },
        ],
      };
    }

    const result = await getDescriptoresEstiloNettalco(
      tcodiestinett,
      ctx.apiTrace,
    );
    if (!result.success) {
      return {
        intent: "quote.descriptores.estiloNettalco",
        entities: { tcodiestinett },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando descriptores",
            data: {
              message: result.message ?? "Error al obtener descriptores.",
            },
          },
        ],
      };
    }

    const rows = ((result.data ?? []) as any[]).slice(0, 200);
    const total = Array.isArray(result.data) ? result.data.length : rows.length;

    return {
      intent: "quote.descriptores.estiloNettalco",
      entities: { tcodiestinett },
      artifacts: [
        {
          type: "table",
          title: `Descriptores (Estilo Nettalco ${tcodiestinett})`,
          data: { rows, total },
        },
      ],
      limits:
        total > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Dimensiones por Estilo Nettalco ─────────────────────
export const quoteDimensionesEstiloNettalcoTool: ToolDefinition = {
  id: "quote.dimensiones.estiloNettalco",
  description:
    "Obtiene dimensiones del estilo Nettalco (elementos) por TCODIESTINETT.",
  requiredParams: ["tcodiestinett"],
  examples: [
    "dimensiones estilo nettalco E12345",
    "dimensiones del estilo nettalco para la cotización 216881",
  ],
  execute: async (params, ctx): Promise<ToolResult> => {
    let tcodiestinett = pickNonEmptyString(params, [
      "tcodiestinett",
      "TCODIESTINETT",
      "estiloNettalco",
    ]);

    if (!tcodiestinett) {
      const d0 = await tryGetDetalleFromUiContext(ctx);
      tcodiestinett =
        typeof d0?.TCODIESTINETT === "string" ? d0.TCODIESTINETT.trim() : null;
    }

    if (!tcodiestinett) {
      return {
        intent: "quote.dimensiones.estiloNettalco",
        entities: { tcodiestinett: null },
        artifacts: [
          {
            type: "warning",
            title: "Falta TCODIESTINETT",
            data: {
              message:
                "Necesito el código de Estilo Nettalco (TCODIESTINETT) o que el usuario esté viendo una cotización con ese dato.",
            },
          },
        ],
      };
    }

    const result = await getDimensionesEstiloNettalco(
      tcodiestinett,
      ctx.apiTrace,
    );
    if (!result.success) {
      return {
        intent: "quote.dimensiones.estiloNettalco",
        entities: { tcodiestinett },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando dimensiones",
            data: {
              message: result.message ?? "Error al obtener dimensiones.",
            },
          },
        ],
      };
    }

    // Normalizar payload: algunos endpoints responden envueltos como { data: { data: [...] } }
    // o { data: { rows: [...] } }. Aquí lo “desempaquetamos”.
    let data: any = (result as any).data;
    for (let i = 0; i < 3; i++) {
      if (Array.isArray(data)) break;
      if (!data || typeof data !== "object") break;

      const maybeRows = (data as any).rows;
      if (Array.isArray(maybeRows)) {
        data = maybeRows;
        break;
      }

      if ("data" in (data as any)) {
        data = (data as any).data;
        continue;
      }

      break;
    }

    if (Array.isArray(data)) {
      const rows = data.slice(0, 200);
      return {
        intent: "quote.dimensiones.estiloNettalco",
        entities: { tcodiestinett },
        artifacts: [
          {
            type: "table",
            title: `Dimensiones (Estilo Nettalco ${tcodiestinett})`,
            data: { rows, total: data.length },
          },
        ],
        limits:
          data.length > 200
            ? { truncated: true, reason: "Se recortó a 200 filas" }
            : undefined,
      };
    }

    // Formato típico del backend principal:
    // data: { detalleCabeceras: [{TCODITALL}], detalleDimensiones: [{TNUMEDIME, TDESCDIME, tallas:[{TCODITALL, TMEDIDIME}]}] }
    if (data && typeof data === "object") {
      const cabeceras = Array.isArray((data as any).detalleCabeceras)
        ? ((data as any).detalleCabeceras as any[])
        : null;
      const dimensiones = Array.isArray((data as any).detalleDimensiones)
        ? ((data as any).detalleDimensiones as any[])
        : null;

      if (cabeceras && dimensiones) {
        const tallas = cabeceras
          .map((c) => (c?.TCODITALL ?? "").toString().trim())
          .filter((t) => t.length > 0);

        // Orden simple numérico si aplica
        tallas.sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return a.localeCompare(b);
        });

        const rowsAll = dimensiones.map((d) => {
          const row: Record<string, any> = {
            TNUMEDIME: d?.TNUMEDIME ?? "N/D",
            TDESCDIME: d?.TDESCDIME ?? "N/D",
          };

          const tallasArr = Array.isArray(d?.tallas) ? (d.tallas as any[]) : [];
          const byTalla = new Map<string, any>();
          for (const t of tallasArr) {
            const k = (t?.TCODITALL ?? "").toString().trim();
            if (!k) continue;
            byTalla.set(k, t?.TMEDIDIME ?? "N/D");
          }

          for (const talla of tallas) {
            row[`TALLA_${talla}`] = byTalla.get(talla) ?? "N/D";
          }

          return row;
        });

        const rows = rowsAll.slice(0, 120);

        return {
          intent: "quote.dimensiones.estiloNettalco",
          entities: { tcodiestinett },
          artifacts: [
            {
              type: "facts",
              title: `Dimensiones (resumen) - Estilo Nettalco ${tcodiestinett}`,
              data: {
                tallas: tallas.join(", ") || "N/D",
                totalDimensiones: rowsAll.length,
              },
            },
            {
              type: "table",
              title: `Dimensiones por talla (Estilo Nettalco ${tcodiestinett})`,
              data: { rows, total: rowsAll.length },
            },
          ],
          limits:
            rowsAll.length > 120
              ? { truncated: true, reason: "Se recortó a 120 filas" }
              : undefined,
        };
      }
    }

    if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
      return {
        intent: "quote.dimensiones.estiloNettalco",
        entities: { tcodiestinett },
        artifacts: [
          {
            type: "warning",
            title: "Sin dimensiones",
            data: {
              message: `No se encontraron dimensiones para el estilo Nettalco ${tcodiestinett} (o el endpoint devolvió un payload vacío).`,
            },
          },
        ],
      };
    }

    return {
      intent: "quote.dimensiones.estiloNettalco",
      entities: { tcodiestinett },
      artifacts: [
        {
          type: "facts",
          title: `Dimensiones (Estilo Nettalco ${tcodiestinett})`,
          data: data ?? {},
        },
      ],
    };
  },
};

// ── TOOL: Extras de una cotización ────────────────────────────
export const quoteExtrasCotizacionTool: ToolDefinition = {
  id: "quote.extras.cotizacion",
  description: "Obtiene los extras asociados a una cotización.",
  requiredParams: ["cotizacionId"],
  examples: ["extras de 216833", "mostrar extras cotización 216833"],
  execute: async (params, ctx): Promise<ToolResult> => {
    const cotizacionId = pickCotizacionId(params);
    if (!cotizacionId) {
      return {
        intent: "quote.extras.cotizacion",
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

    const result = await getExtrasCotizacion(cotizacionId, ctx.apiTrace);
    if (!result.success) {
      return {
        intent: "quote.extras.cotizacion",
        entities: { cotizacionId },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando extras",
            data: { message: result.message ?? "Error al obtener extras." },
          },
        ],
      };
    }

    const extras = (result.data ?? []) as any[];
    const rows = extras.slice(0, 200);

    return {
      intent: "quote.extras.cotizacion",
      entities: { cotizacionId },
      artifacts: [
        {
          type: "table",
          title: `Extras de la cotización ${cotizacionId}`,
          data: { rows, total: extras.length },
        },
      ],
      limits:
        extras.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Rubros de extras ────────────────────────────────────
export const quoteExtrasRubrosTool: ToolDefinition = {
  id: "quote.extras.rubros",
  description:
    "Lista rubros disponibles para extras (opcional filtrar por tcodirubr).",
  requiredParams: [],
  examples: ["rubros de extras", "rubros extras tcodirubr 02"],
  execute: async (params, ctx): Promise<ToolResult> => {
    const tcodirubr = pickNonEmptyString(params, ["tcodirubr", "TCODIRUBR"]);
    const result = await getExtrasRubros(ctx.apiTrace, tcodirubr ?? undefined);
    if (!result.success) {
      return {
        intent: "quote.extras.rubros",
        entities: { tcodirubr: tcodirubr ?? null },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando rubros",
            data: {
              message: result.message ?? "Error al obtener rubros de extras.",
            },
          },
        ],
      };
    }

    const rubros = (result.data ?? []) as any[];
    const rows = rubros.slice(0, 200);

    return {
      intent: "quote.extras.rubros",
      entities: { tcodirubr: tcodirubr ?? null },
      artifacts: [
        {
          type: "table",
          title: tcodirubr
            ? `Rubros de extras (filtro ${tcodirubr})`
            : "Rubros de extras",
          data: { rows, total: rubros.length },
        },
      ],
      limits:
        rubros.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Hilados por color (cotización) ──────────────────────
export const quoteHiladosPorColorCotizacionTool: ToolDefinition = {
  id: "quote.hilados.color.cotizacion",
  description:
    "Obtiene hilados por color asociados a una cotización (hilados-color/cotizacion).",
  requiredParams: ["cotizacionId"],
  examples: [
    "hilados por color 216833",
    "hilados-color de la cotización 216833",
  ],
  execute: async (params, ctx): Promise<ToolResult> => {
    const cotizacionId = pickCotizacionId(params);
    if (!cotizacionId) {
      return {
        intent: "quote.hilados.color.cotizacion",
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

    const result = await getHiladosPorColorCotizacion(
      cotizacionId,
      ctx.apiTrace,
    );
    if (!result.success) {
      return {
        intent: "quote.hilados.color.cotizacion",
        entities: { cotizacionId },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando hilados por color",
            data: {
              message: result.message ?? "Error al obtener hilados por color.",
            },
          },
        ],
      };
    }

    const rowsAll = (result.data ?? []) as any[];
    const rows = rowsAll.slice(0, 200);

    return {
      intent: "quote.hilados.color.cotizacion",
      entities: { cotizacionId },
      artifacts: [
        {
          type: "table",
          title: `Hilados por color - cotización ${cotizacionId}`,
          data: { rows, total: rowsAll.length },
        },
      ],
      limits:
        rowsAll.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Hilados por color (items) ───────────────────────────
export const quoteHiladosPorColorItemsTool: ToolDefinition = {
  id: "quote.hilados.color.items",
  description:
    "Lista items disponibles para hilados por color (opcional filtrar por numeItem).",
  requiredParams: [],
  examples: ["items de hilados por color", "items hilados-color numeItem 10"],
  execute: async (params, ctx): Promise<ToolResult> => {
    const numeItem = pickNonEmptyString(params, ["numeItem", "NUMEITEM"]);
    const result = await getHiladosPorColorItems(
      ctx.apiTrace,
      numeItem ?? undefined,
    );
    if (!result.success) {
      return {
        intent: "quote.hilados.color.items",
        entities: { numeItem: numeItem ?? null },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando items",
            data: {
              message:
                result.message ??
                "Error al obtener items de hilados por color.",
            },
          },
        ],
      };
    }

    const rowsAll = (result.data ?? []) as any[];
    const rows = rowsAll.slice(0, 200);

    return {
      intent: "quote.hilados.color.items",
      entities: { numeItem: numeItem ?? null },
      artifacts: [
        {
          type: "table",
          title: numeItem
            ? `Items hilados por color (filtro ${numeItem})`
            : "Items hilados por color",
          data: { rows, total: rowsAll.length },
        },
      ],
      limits:
        rowsAll.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Hilados por color (colores) ─────────────────────────
export const quoteHiladosPorColorColoresTool: ToolDefinition = {
  id: "quote.hilados.color.colores",
  description:
    "Lista colores disponibles para hilados por color (opcional filtrar por numeColor).",
  requiredParams: [],
  examples: [
    "colores de hilados por color",
    "colores hilados-color numeColor 5",
  ],
  execute: async (params, ctx): Promise<ToolResult> => {
    const numeColor = pickNonEmptyString(params, ["numeColor", "NUMECOLOR"]);
    const result = await getHiladosPorColorColores(
      ctx.apiTrace,
      numeColor ?? undefined,
    );
    if (!result.success) {
      return {
        intent: "quote.hilados.color.colores",
        entities: { numeColor: numeColor ?? null },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando colores",
            data: {
              message:
                result.message ??
                "Error al obtener colores de hilados por color.",
            },
          },
        ],
      };
    }

    const rowsAll = (result.data ?? []) as any[];
    const rows = rowsAll.slice(0, 200);

    return {
      intent: "quote.hilados.color.colores",
      entities: { numeColor: numeColor ?? null },
      artifacts: [
        {
          type: "table",
          title: numeColor
            ? `Colores hilados por color (filtro ${numeColor})`
            : "Colores hilados por color",
          data: { rows, total: rowsAll.length },
        },
      ],
      limits:
        rowsAll.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Hilados especiales (cotización) ─────────────────────
export const quoteHiladosEspecialesCotizacionTool: ToolDefinition = {
  id: "quote.hilados.especiales.cotizacion",
  description: "Obtiene hilados especiales asociados a una cotización.",
  requiredParams: ["cotizacionId"],
  examples: ["hilados especiales 216833", "hilados-especiales de 216833"],
  execute: async (params, ctx): Promise<ToolResult> => {
    const cotizacionId = pickCotizacionId(params);
    if (!cotizacionId) {
      return {
        intent: "quote.hilados.especiales.cotizacion",
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

    const result = await getHiladosEspecialesCotizacion(
      cotizacionId,
      ctx.apiTrace,
    );
    if (!result.success) {
      return {
        intent: "quote.hilados.especiales.cotizacion",
        entities: { cotizacionId },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando hilados especiales",
            data: {
              message: result.message ?? "Error al obtener hilados especiales.",
            },
          },
        ],
      };
    }

    const rowsAll = (result.data ?? []) as any[];
    const rows = rowsAll.slice(0, 200);

    return {
      intent: "quote.hilados.especiales.cotizacion",
      entities: { cotizacionId },
      artifacts: [
        {
          type: "table",
          title: `Hilados especiales - cotización ${cotizacionId}`,
          data: { rows, total: rowsAll.length },
        },
      ],
      limits:
        rowsAll.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Hilados especiales (items) ──────────────────────────
export const quoteHiladosEspecialesItemsTool: ToolDefinition = {
  id: "quote.hilados.especiales.items",
  description:
    "Lista items disponibles para hilados especiales (opcional filtrar por numeItem).",
  requiredParams: [],
  examples: [
    "items de hilados especiales",
    "items hilados especiales numeItem 10",
  ],
  execute: async (params, ctx): Promise<ToolResult> => {
    const numeItem = pickNonEmptyString(params, ["numeItem", "NUMEITEM"]);
    const result = await getHiladosEspecialesItems(
      ctx.apiTrace,
      numeItem ?? undefined,
    );
    if (!result.success) {
      return {
        intent: "quote.hilados.especiales.items",
        entities: { numeItem: numeItem ?? null },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando items",
            data: {
              message:
                result.message ??
                "Error al obtener items de hilados especiales.",
            },
          },
        ],
      };
    }

    const rowsAll = (result.data ?? []) as any[];
    const rows = rowsAll.slice(0, 200);

    return {
      intent: "quote.hilados.especiales.items",
      entities: { numeItem: numeItem ?? null },
      artifacts: [
        {
          type: "table",
          title: numeItem
            ? `Items hilados especiales (filtro ${numeItem})`
            : "Items hilados especiales",
          data: { rows, total: rowsAll.length },
        },
      ],
      limits:
        rowsAll.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Minutajes de una cotización ─────────────────────────
export const quoteMinutajesCotizacionTool: ToolDefinition = {
  id: "quote.minutajes.cotizacion",
  description: "Obtiene minutajes asociados a una cotización.",
  requiredParams: ["cotizacionId"],
  examples: ["minutajes de 216833", "mostrar minutajes cotización 216833"],
  execute: async (params, ctx): Promise<ToolResult> => {
    const cotizacionId = pickCotizacionId(params);
    if (!cotizacionId) {
      return {
        intent: "quote.minutajes.cotizacion",
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

    const result = await getMinutajesCotizacion(cotizacionId, ctx.apiTrace);
    if (!result.success) {
      return {
        intent: "quote.minutajes.cotizacion",
        entities: { cotizacionId },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando minutajes",
            data: {
              message: result.message ?? "Error al obtener minutajes.",
            },
          },
        ],
      };
    }

    const rowsAll = (result.data ?? []) as any[];
    const rows = rowsAll.slice(0, 200);

    return {
      intent: "quote.minutajes.cotizacion",
      entities: { cotizacionId },
      artifacts: [
        {
          type: "table",
          title: `Minutajes de la cotización ${cotizacionId}`,
          data: { rows, total: rowsAll.length },
        },
      ],
      limits:
        rowsAll.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Códigos de minutajes ────────────────────────────────
export const quoteMinutajesCodigosTool: ToolDefinition = {
  id: "quote.minutajes.codigos",
  description:
    "Lista códigos/actividades de minutajes (opcional filtrar por tcodiacti).",
  requiredParams: [],
  examples: ["códigos de minutajes", "minutajes códigos tcodiacti 010"],
  execute: async (params, ctx): Promise<ToolResult> => {
    const tcodiacti = pickNonEmptyString(params, ["tcodiacti", "TCODIACTI"]);
    const result = await getMinutajesCodigos(
      ctx.apiTrace,
      tcodiacti ?? undefined,
    );
    if (!result.success) {
      return {
        intent: "quote.minutajes.codigos",
        entities: { tcodiacti: tcodiacti ?? null },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando códigos",
            data: {
              message:
                result.message ?? "Error al obtener códigos de minutajes.",
            },
          },
        ],
      };
    }

    const rowsAll = (result.data ?? []) as any[];
    const rows = rowsAll.slice(0, 200);

    return {
      intent: "quote.minutajes.codigos",
      entities: { tcodiacti: tcodiacti ?? null },
      artifacts: [
        {
          type: "table",
          title: tcodiacti
            ? `Códigos de minutajes (filtro ${tcodiacti})`
            : "Códigos de minutajes",
          data: { rows, total: rowsAll.length },
        },
      ],
      limits:
        rowsAll.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Lista de minutajes por estilo cliente ───────────────
export const quoteListaMinutajesClienteTool: ToolDefinition = {
  id: "quote.minutajes.cliente",
  description: "Obtiene lista de minutajes por estilo cliente (tcodiesticlie).",
  requiredParams: ["tcodiesticlie"],
  examples: [
    "minutajes del estilo cliente ABC123",
    "lista minutajes cliente ABC123",
  ],
  execute: async (params, ctx): Promise<ToolResult> => {
    let tcodiesticlie = pickNonEmptyString(params, [
      "tcodiesticlie",
      "TCODIESTICLIE",
      "estiloCliente",
    ]);

    if (!tcodiesticlie) {
      const d0 = await tryGetDetalleFromUiContext(ctx);
      tcodiesticlie =
        typeof d0?.TCODIESTICLIE === "string" ? d0.TCODIESTICLIE.trim() : null;
    }

    if (!tcodiesticlie) {
      return {
        intent: "quote.minutajes.cliente",
        entities: { tcodiesticlie: null },
        artifacts: [
          {
            type: "warning",
            title: "Falta TCODIESTICLIE",
            data: {
              message:
                "Necesito el código de Estilo Cliente (TCODIESTICLIE) o que el usuario esté viendo una cotización con ese dato.",
            },
          },
        ],
      };
    }

    const result = await getListaMinutajesCliente(tcodiesticlie, ctx.apiTrace);
    if (!result.success) {
      return {
        intent: "quote.minutajes.cliente",
        entities: { tcodiesticlie },
        artifacts: [
          {
            type: "warning",
            title: "Error consultando lista de minutajes",
            data: {
              message: result.message ?? "Error al obtener lista de minutajes.",
            },
          },
        ],
      };
    }

    const rowsAll = (result.data ?? []) as any[];
    const rows = rowsAll.slice(0, 200);

    return {
      intent: "quote.minutajes.cliente",
      entities: { tcodiesticlie },
      artifacts: [
        {
          type: "table",
          title: `Lista de minutajes (Estilo Cliente ${tcodiesticlie})`,
          data: { rows, total: rowsAll.length },
        },
      ],
      limits:
        rowsAll.length > 200
          ? { truncated: true, reason: "Se recortó a 200 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Listar candidatos para comparación ──────────────────
export const quoteListCandidatesTool: ToolDefinition = {
  id: "quote.compare.candidates",
  description:
    "Lista las cotizaciones candidatas para comparación por grupo (ESTILO_CLIENTE, ESTILO_NETTALCO, CLIENTE, GLOBAL).",
  requiredParams: ["cotizacionId", "grupo"],
  examples: [
    "listar candidatos por estilo cliente para 217442",
    "cotizaciones similares del mismo cliente para 217442",
    "candidatos globales para la 217442",
  ],
  execute: async (params): Promise<ToolResult> => {
    const cotizacionId = pickCotizacionId(params);
    const grupo = (params.grupo ?? "ESTILO_CLIENTE")
      .toString()
      .toUpperCase()
      .trim();
    const gruposValidos = [
      "ESTILO_CLIENTE",
      "ESTILO_NETTALCO",
      "CLIENTE",
      "GLOBAL",
    ];

    if (!cotizacionId) {
      return {
        intent: "quote.compare.candidates",
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

    if (!gruposValidos.includes(grupo)) {
      return {
        intent: "quote.compare.candidates",
        entities: { cotizacionId, grupo },
        artifacts: [
          {
            type: "warning",
            title: "Grupo inválido",
            data: {
              message: `El grupo "${grupo}" no es válido. Opciones: ${gruposValidos.join(", ")}`,
            },
          },
        ],
      };
    }

    const result = await obtenerCandidatos(cotizacionId, grupo as any);

    if (!result.success || !result.data) {
      return {
        intent: "quote.compare.candidates",
        entities: { cotizacionId, grupo },
        artifacts: [
          {
            type: "warning",
            title: "Sin candidatos",
            data: {
              message:
                result.error ??
                "No se encontraron candidatos para comparación.",
            },
          },
        ],
      };
    }

    const { candidatos, cotizacionActual, total } = result.data;
    const mejorCandidato = seleccionarMejorCandidato(candidatos);

    // Mostrar los primeros 20 candidatos como tabla
    const rows = candidatos.slice(0, 20).map((c: any) => ({
      ID: c.COTIZACION_ID,
      Temporada: c.TEMPORADA,
      "Precio FOB": c.PRECIO_FOB ?? "N/D",
      "Costo Pond.": c.COSTO_PONDERADO ?? "N/D",
      Estado: c.ESTADO ?? "N/D",
    }));

    return {
      intent: "quote.compare.candidates",
      entities: { cotizacionId, grupo },
      artifacts: [
        {
          type: "facts",
          title: `Candidatos para comparación (${grupo})`,
          data: {
            "Cotización Actual": cotizacionActual
              ? `#${cotizacionActual.COTIZACION_ID} (${cotizacionActual.TEMPORADA ?? ""})`
              : cotizacionId,
            "Total candidatos": total,
            "Mejor candidato sugerido": mejorCandidato
              ? `#${mejorCandidato.COTIZACION_ID} (${mejorCandidato.TEMPORADA})`
              : "Ninguno",
            Grupo: grupo,
          },
        },
        {
          type: "table",
          title: `Lista de candidatos (${grupo})`,
          data: { rows, total },
        },
      ],
      limits:
        total > 20
          ? { truncated: true, reason: "Se muestran los primeros 20" }
          : undefined,
    };
  },
};

// ── TOOL: Comparar KPIs entre dos cotizaciones ────────────────
export const quoteCompareKpisTool: ToolDefinition = {
  id: "quote.compare.kpis",
  description:
    "Compara los KPIs (Precio FOB, Costo Ponderado, Markup, Prendas Estimadas) entre dos cotizaciones específicas.",
  requiredParams: ["cotizacionActual", "cotizacionAnterior"],
  examples: [
    "compara kpis entre 217442 y 170719",
    "kpis de 217442 vs 214864",
    "diferencias financieras entre ambas cotizaciones",
  ],
  execute: async (params): Promise<ToolResult> => {
    const cotActual = Number(params.cotizacionActual);
    const cotAnterior = Number(params.cotizacionAnterior);

    if (!Number.isFinite(cotActual) || !Number.isFinite(cotAnterior)) {
      return {
        intent: "quote.compare.kpis",
        entities: {
          cotizacionActual: params.cotizacionActual,
          cotizacionAnterior: params.cotizacionAnterior,
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

    const result = await compararKPIs(cotActual, cotAnterior);

    if (!result.success || !result.data) {
      return {
        intent: "quote.compare.kpis",
        entities: {
          cotizacionActual: cotActual,
          cotizacionAnterior: cotAnterior,
        },
        artifacts: [
          {
            type: "warning",
            title: "Comparación no disponible",
            data: {
              message: result.error ?? "No se pudieron comparar los KPIs.",
            },
          },
        ],
      };
    }

    const kpis = result.data;
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
      intent: "quote.compare.kpis",
      entities: {
        cotizacionActual: cotActual,
        cotizacionAnterior: cotAnterior,
      },
      artifacts: [
        {
          type: "facts",
          title: "Comparación de KPIs",
          data: {
            "Cotización Actual": `#${cotActual} (${kpis.cotizacionActual.temporada})`,
            "Cotización Anterior": `#${cotAnterior} (${kpis.cotizacionAnterior.temporada})`,
          },
        },
        {
          type: "table",
          title: "KPIs comparados",
          data: { rows: tableData, total: 4 },
        },
      ],
    };
  },
};

// ── TOOL: Comparar componentes entre dos cotizaciones ─────────
export const quoteCompareComponentesTool: ToolDefinition = {
  id: "quote.compare.components",
  description:
    "Compara los componentes (avíos, telas, hilos, etc.) entre dos cotizaciones específicas.",
  requiredParams: ["cotizacionActual", "cotizacionAnterior"],
  examples: [
    "compara componentes entre 217442 y 170719",
    "diferencia de avíos entre ambas cotizaciones",
    "qué componentes cambiaron entre 217442 y 214864",
  ],
  execute: async (params): Promise<ToolResult> => {
    const cotActual = Number(params.cotizacionActual);
    const cotAnterior = Number(params.cotizacionAnterior);

    if (!Number.isFinite(cotActual) || !Number.isFinite(cotAnterior)) {
      return {
        intent: "quote.compare.components",
        entities: {
          cotizacionActual: params.cotizacionActual,
          cotizacionAnterior: params.cotizacionAnterior,
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

    const result = await compararComponentes(cotActual, cotAnterior);

    if (!result.success || !result.data) {
      return {
        intent: "quote.compare.components",
        entities: {
          cotizacionActual: cotActual,
          cotizacionAnterior: cotAnterior,
        },
        artifacts: [
          {
            type: "warning",
            title: "Comparación no disponible",
            data: {
              message:
                result.error ?? "No se pudieron comparar los componentes.",
            },
          },
        ],
      };
    }

    const rows = result.data.slice(0, 60);

    return {
      intent: "quote.compare.components",
      entities: {
        cotizacionActual: cotActual,
        cotizacionAnterior: cotAnterior,
      },
      artifacts: [
        {
          type: "table",
          title: `Comparación de Componentes (#${cotActual} vs #${cotAnterior})`,
          data: { rows, total: result.data.length },
        },
      ],
      limits:
        result.data.length > 60
          ? { truncated: true, reason: "Se recortó a 60 filas" }
          : undefined,
    };
  },
};

// ── TOOL: Comparar minutajes entre dos cotizaciones ───────────
export const quoteCompareMinutajesTool: ToolDefinition = {
  id: "quote.compare.minutajes",
  description:
    "Compara los minutajes (tiempos de corte, costura, acabado y sus eficiencias) entre dos cotizaciones específicas.",
  requiredParams: ["cotizacionActual", "cotizacionAnterior"],
  examples: [
    "compara minutajes entre 217442 y 170719",
    "tiempos de producción entre ambas cotizaciones",
    "minutajes 217442 vs 214864",
  ],
  execute: async (params): Promise<ToolResult> => {
    const cotActual = Number(params.cotizacionActual);
    const cotAnterior = Number(params.cotizacionAnterior);

    if (!Number.isFinite(cotActual) || !Number.isFinite(cotAnterior)) {
      return {
        intent: "quote.compare.minutajes",
        entities: {
          cotizacionActual: params.cotizacionActual,
          cotizacionAnterior: params.cotizacionAnterior,
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

    const result = await compararMinutajes(cotActual, cotAnterior);

    if (!result.success || !result.data) {
      return {
        intent: "quote.compare.minutajes",
        entities: {
          cotizacionActual: cotActual,
          cotizacionAnterior: cotAnterior,
        },
        artifacts: [
          {
            type: "warning",
            title: "Comparación no disponible",
            data: {
              message: result.error ?? "No se pudieron comparar los minutajes.",
            },
          },
        ],
      };
    }

    const rows = result.data;

    return {
      intent: "quote.compare.minutajes",
      entities: {
        cotizacionActual: cotActual,
        cotizacionAnterior: cotAnterior,
      },
      artifacts: [
        {
          type: "table",
          title: `Comparación de Minutajes (#${cotActual} vs #${cotAnterior})`,
          data: { rows, total: rows.length },
        },
      ],
    };
  },
};

// ── TOOL: Buscar cotización por ID ─────────────────────────────
export const quoteSearchTool: ToolDefinition = {
  id: "quote.search",
  description:
    "Busca una cotización por su ID numérico y devuelve su detalle completo.",
  requiredParams: ["cotizacionId"],
  examples: [
    "buscar cotización 217442",
    "existe la cotización 215000?",
    "información de la 216881",
  ],
  execute: async (params, ctx): Promise<ToolResult> => {
    const cotizacionId = pickCotizacionId(params);
    if (!cotizacionId) {
      return {
        intent: "quote.search",
        entities: { cotizacionId: null },
        artifacts: [
          {
            type: "warning",
            title: "Falta cotizacionId",
            data: { message: "Necesito el ID de la cotización a buscar." },
          },
        ],
      };
    }

    const result = await getDetalleCotizacion(cotizacionId, ctx.apiTrace);
    if (!result.success) {
      return {
        intent: "quote.search",
        entities: { cotizacionId },
        artifacts: [
          {
            type: "warning",
            title: "Cotización no encontrada",
            data: {
              message:
                result.message ??
                `No se encontró la cotización #${cotizacionId}.`,
            },
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
      intent: "quote.search",
      entities: { cotizacionId },
      artifacts: [
        {
          type: "facts",
          title: `Cotización #${cotizacionId} encontrada`,
          data: facts,
        },
      ],
    };
  },
};

// ── TOOL: Sugerir precio (análisis completo) ───────────────────
export const quoteSuggestPriceTool: ToolDefinition = {
  id: "quote.suggest.price",
  description:
    "Analiza la cotización comparándola con históricos (KPIs, componentes, minutajes) para sugerir un precio óptimo.",
  requiredParams: ["cotizacionId"],
  examples: [
    "sugiere un precio para la 217442",
    "precio óptimo para la cotización 217442",
    "análisis de precio 217442",
  ],
  execute: async (params, ctx): Promise<ToolResult> => {
    const cotizacionId = pickCotizacionId(params);
    if (!cotizacionId) {
      return {
        intent: "quote.suggest.price",
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

    // 1) Obtener detalle actual
    const detalleResult = await getDetalleCotizacion(
      cotizacionId,
      ctx.apiTrace,
    );
    const d0 = detalleResult.success
      ? Array.isArray((detalleResult as any).data?.data)
        ? (detalleResult as any).data.data[0]
        : ((detalleResult as any).data?.[0] ?? (detalleResult as any).data)
      : null;

    // 2) Ejecutar comparación completa (KPIs + componentes + minutajes)
    const comparacion = await ejecutarComparacionCompleta(
      cotizacionId,
      "ESTILO_CLIENTE",
    );

    if (!comparacion.success || !comparacion.kpis) {
      // Intentar con comparación por cliente si no hay estilo
      const compCliente = await ejecutarComparacionCompleta(
        cotizacionId,
        "CLIENTE",
      );
      if (!compCliente.success || !compCliente.kpis) {
        return {
          intent: "quote.suggest.price",
          entities: { cotizacionId },
          artifacts: [
            {
              type: "warning",
              title: "Sin datos históricos",
              data: {
                message:
                  "No se encontraron cotizaciones históricas para comparar. No es posible sugerir un precio sin referencia.",
              },
            },
            ...(d0
              ? [
                  {
                    type: "facts" as const,
                    title: "Datos actuales de la cotización",
                    data: { ...d0, TCODICOTI: d0.TCODICOTI ?? cotizacionId },
                  },
                ]
              : []),
          ],
        };
      }
      // Usar comparación por cliente
      return buildSuggestResult(cotizacionId, d0, compCliente, "CLIENTE");
    }

    return buildSuggestResult(cotizacionId, d0, comparacion, "ESTILO_CLIENTE");
  },
};

function buildSuggestResult(
  cotizacionId: number,
  detalle: any,
  comparacion: any,
  grupo: string,
): ToolResult {
  const kpis = comparacion.kpis;
  const actual = kpis.cotizacionActual;
  const anterior = kpis.cotizacionAnterior;
  const diff = kpis.diferencias;

  // Calcular markup actual y anterior
  const markupActual =
    actual.costoPonderado > 0
      ? ((actual.precioFob - actual.costoPonderado) / actual.costoPonderado) *
        100
      : null;
  const markupAnterior =
    anterior.costoPonderado > 0
      ? ((anterior.precioFob - anterior.costoPonderado) /
          anterior.costoPonderado) *
        100
      : null;

  // Datos para que el modelo razone
  const analisis: Record<string, any> = {
    cotizacionId,
    grupo_comparacion: grupo,
    cotizacion_base: comparacion.candidatoSeleccionado?.COTIZACION_ID,
    total_candidatos: comparacion.totalCandidatos,
    precioFob_actual: actual.precioFob,
    costoPonderado_actual: actual.costoPonderado,
    markup_actual_pct: markupActual != null ? +markupActual.toFixed(2) : "N/D",
    precioFob_anterior: anterior.precioFob,
    costoPonderado_anterior: anterior.costoPonderado,
    markup_anterior_pct:
      markupAnterior != null ? +markupAnterior.toFixed(2) : "N/D",
    diferencia_precioFob: diff.precioFob,
    diferencia_costoPonderado: diff.costoPonderado,
    diferencia_markup_pts: diff.markup,
    prendasEstimadas_actual: actual.prendasEstimadas,
    prendasEstimadas_anterior: anterior.prendasEstimadas,
  };

  // Agregar info de detalle si existe
  if (detalle) {
    analisis.cliente = detalle.TDESCDIVICLIEABRV ?? detalle.TDESCCLIE ?? null;
    analisis.estilo_cliente = detalle.TCODIESTICLIE ?? null;
    analisis.temporada = detalle.TCODITEMP ?? null;
    analisis.estado = detalle.TDESCESTA ?? null;
  }

  const artifacts: any[] = [
    {
      type: "facts",
      title: `Análisis completo para sugerencia de precio (${grupo})`,
      data: analisis,
    },
  ];

  // Agregar componentes si existen
  if (comparacion.componentes && comparacion.componentes.length > 0) {
    artifacts.push({
      type: "table",
      title: `Comparación de Componentes (vs #${comparacion.candidatoSeleccionado?.COTIZACION_ID})`,
      data: {
        rows: comparacion.componentes,
        total: comparacion.componentes.length,
      },
    });
  }

  // Agregar minutajes si existen
  if (comparacion.minutajes && comparacion.minutajes.length > 0) {
    artifacts.push({
      type: "table",
      title: `Comparación de Minutajes (vs #${comparacion.candidatoSeleccionado?.COTIZACION_ID})`,
      data: {
        rows: comparacion.minutajes,
        total: comparacion.minutajes.length,
      },
    });
  }

  return {
    intent: "quote.suggest.price",
    entities: { cotizacionId },
    artifacts,
  };
}

// ── TOOL: Calcular markup ──────────────────────────────────────
export const quoteCalcMarkupTool: ToolDefinition = {
  id: "quote.calc.markup",
  description:
    "Calcula el markup y métricas de rentabilidad dados un precio FOB y un costo ponderado.",
  requiredParams: ["precioFob", "costoPonderado"],
  examples: [
    "calcula markup con precio 12.50 y costo 9.80",
    "markup de FOB 15 y costo 11.5",
    "si el precio es 14 y el costo 10, ¿cuánto es el markup?",
  ],
  execute: async (params): Promise<ToolResult> => {
    const precioFob = Number(params.precioFob);
    const costoPonderado = Number(params.costoPonderado);

    if (
      !Number.isFinite(precioFob) ||
      !Number.isFinite(costoPonderado) ||
      precioFob < 0 ||
      costoPonderado < 0
    ) {
      return {
        intent: "quote.calc.markup",
        entities: {
          precioFob: params.precioFob,
          costoPonderado: params.costoPonderado,
        },
        artifacts: [
          {
            type: "warning",
            title: "Parámetros inválidos",
            data: {
              message:
                "Necesito un precio FOB y un costo ponderado válidos (números positivos).",
            },
          },
        ],
      };
    }

    if (costoPonderado === 0) {
      return {
        intent: "quote.calc.markup",
        entities: { precioFob, costoPonderado },
        artifacts: [
          {
            type: "warning",
            title: "Costo es cero",
            data: {
              message:
                "El costo ponderado es $0. La cotización aún no ha sido costeada, no se puede calcular markup.",
            },
          },
        ],
      };
    }

    const markup = ((precioFob - costoPonderado) / costoPonderado) * 100;
    const ganancia = precioFob - costoPonderado;
    const ratio = precioFob / costoPonderado;

    // Clasificación de salud del markup
    let salud: string;
    if (markup < 0) salud = "❌ Negativo (pérdida)";
    else if (markup < 10) salud = "⚠️ Bajo (< 10%)";
    else if (markup < 15) salud = "⚠️ Ajustado (10-15%)";
    else if (markup <= 25) salud = "✅ Saludable (15-25%)";
    else if (markup <= 40) salud = "✅ Bueno (25-40%)";
    else salud = "🔵 Alto (> 40%)";

    return {
      intent: "quote.calc.markup",
      entities: { precioFob, costoPonderado },
      artifacts: [
        {
          type: "facts",
          title: "Cálculo de Markup",
          data: {
            "Precio FOB": `$${precioFob.toFixed(2)}`,
            "Costo Ponderado": `$${costoPonderado.toFixed(2)}`,
            "Ganancia por unidad": `$${ganancia.toFixed(2)}`,
            "Markup (%)": `${markup.toFixed(2)}%`,
            "Ratio Precio/Costo": ratio.toFixed(3),
            Evaluación: salud,
          },
        },
      ],
    };
  },
};
