import { getColoresCotizacion, getComponentesCotizacion, getDetalleCotizacion } from './backendPrincipalApi.js';
function pickCotizacionId(params) {
    const raw = params.cotizacionId ?? params.tcodicoti ?? null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return n;
}
export const quoteDetailTool = {
    id: 'quote.detail',
    description: 'Obtiene el detalle completo de una cotización (gestión/detalle).',
    requiredParams: ['cotizacionId'],
    examples: ['216881', 'detalle de la cotización 216881'],
    execute: async (params, ctx) => {
        const cotizacionId = pickCotizacionId(params);
        if (!cotizacionId) {
            return {
                intent: 'quote.detail',
                entities: { cotizacionId: null },
                artifacts: [
                    { type: 'warning', title: 'Falta cotizacionId', data: { message: 'Necesito el ID de la cotización.' } }
                ],
            };
        }
        const result = await getDetalleCotizacion(cotizacionId, ctx.apiTrace);
        if (!result.success) {
            return {
                intent: 'quote.detail',
                entities: { cotizacionId },
                artifacts: [
                    { type: 'warning', title: 'Error consultando detalle', data: { message: result.message ?? 'Error al obtener detalle.' } }
                ],
            };
        }
        const d0 = Array.isArray(result.data?.data) ? result.data.data[0] : result.data?.[0] ?? result.data;
        const facts = d0 && typeof d0 === 'object'
            ? {
                TCODICOTI: d0.TCODICOTI ?? cotizacionId,
                ESTILO_NETTALCO: d0.TNUMEVERSESTINETT ?? d0.TCODIESTINETT ?? null,
                ESTILO_CLIENTE: d0.TCODIESTICLIE ?? null,
                CLIENTE: d0.TABRVCLIE ?? d0.TDESCDIVICLIEABRV ?? d0.TDESCDIVICLIE ?? null,
                TEMPORADA: d0.TCODITEMP ?? null,
                ESTADO: d0.TDESCESTACOTI ?? d0.TESTACOTI ?? null,
                PRECIO_FOB: d0.TPRECCOTI ?? null,
                COSTO_PONDERADO: d0.TCOSTPOND ?? null,
                MARKUP: d0.MARKUP ?? null,
            }
            : { TCODICOTI: cotizacionId };
        return {
            intent: 'quote.detail',
            entities: { cotizacionId },
            artifacts: [
                { type: 'facts', title: 'Detalle de cotización (resumen)', data: facts },
            ],
        };
    },
};
export const quoteColorsTool = {
    id: 'quote.colors',
    description: 'Obtiene los colores asociados a una cotización.',
    requiredParams: ['cotizacionId'],
    examples: ['colores de 216833', 'mostrar colores cotización 216833'],
    execute: async (params, ctx) => {
        const cotizacionId = pickCotizacionId(params);
        if (!cotizacionId) {
            return {
                intent: 'quote.colors',
                entities: { cotizacionId: null },
                artifacts: [
                    { type: 'warning', title: 'Falta cotizacionId', data: { message: 'Necesito el ID de la cotización.' } }
                ],
            };
        }
        const result = await getColoresCotizacion(cotizacionId, ctx.apiTrace);
        if (!result.success) {
            return {
                intent: 'quote.colors',
                entities: { cotizacionId },
                artifacts: [
                    { type: 'warning', title: 'Error consultando colores', data: { message: result.message ?? 'Error al obtener colores.' } }
                ],
            };
        }
        const colores = (result.data ?? []);
        const compact = colores.slice(0, 200).map(c => ({
            tipocoln: c.tipocoln ?? c.TTIPOCOLN ?? c.TIPOCOLN ?? null,
            desctipocoln: c.desctipocoln ?? c.TDESCTIPOCOLN ?? null,
            numecoln: c.numecoln ?? c.TNUMECOLN ?? c.NUMECOLN ?? null,
            desccoln: c.desccoln ?? c.TDESCCOLN ?? null,
            numecolo: c.numecolo ?? c.TNUMECOLO ?? c.NUMECOLO ?? null,
            porcpart: c.porcpart ?? c.TPORCPART ?? c.PORCPART ?? null,
            inditona: c.inditona ?? c.TINDITONA ?? null,
        }));
        return {
            intent: 'quote.colors',
            entities: { cotizacionId },
            artifacts: [
                { type: 'table', title: `Colores de la cotización ${cotizacionId}`, data: { rows: compact, total: colores.length } },
            ],
            limits: colores.length > 200 ? { truncated: true, reason: 'Se recortó a 200 filas' } : undefined,
        };
    },
};
export const quoteComponentsTool = {
    id: 'quote.components',
    description: 'Obtiene los componentes asociados a una cotización.',
    requiredParams: ['cotizacionId'],
    examples: ['componentes 216833', 'componentes de la cotización 216833'],
    execute: async (params, ctx) => {
        const cotizacionId = pickCotizacionId(params);
        if (!cotizacionId) {
            return {
                intent: 'quote.components',
                entities: { cotizacionId: null },
                artifacts: [
                    { type: 'warning', title: 'Falta cotizacionId', data: { message: 'Necesito el ID de la cotización.' } }
                ],
            };
        }
        const result = await getComponentesCotizacion(cotizacionId, ctx.apiTrace);
        if (!result.success) {
            return {
                intent: 'quote.components',
                entities: { cotizacionId },
                artifacts: [
                    { type: 'warning', title: 'Error consultando componentes', data: { message: result.message ?? 'Error al obtener componentes.' } }
                ],
            };
        }
        const componentes = (result.data ?? []);
        const compact = componentes.slice(0, 60).map(c => ({
            numecomp: c.numecomp ?? c.TNUMECOMP ?? null,
            tipocomp: c.tipocomp ?? c.TTIPOCOMP ?? null,
            desctipocomp: (c.desctipocomp ?? c.TDESCTIPOCOMP ?? null)?.toString().trim() || null,
            desccomp: (c.desccomp ?? c.TDESCCOMP ?? null)?.toString().trim() || null,
            tipoitem: c.tipoitem ?? c.TTIPOITEM ?? null,
            numeitem: c.numeitem ?? c.TNUMEITEM ?? null,
            descitem: (c.descitem ?? c.TDESCITEM ?? null)?.toString().trim() || null,
            consneto: c.consneto ?? c.TCONSNETO ?? null,
        }));
        const countsByTipo = {};
        for (const row of compact) {
            const k = (row.desctipocomp ?? row.tipocomp ?? 'N/A').toString();
            countsByTipo[k] = (countsByTipo[k] ?? 0) + 1;
        }
        return {
            intent: 'quote.components',
            entities: { cotizacionId },
            artifacts: [
                { type: 'facts', title: `Componentes (resumen) - cotización ${cotizacionId}`, data: { total: componentes.length, porTipo: countsByTipo } },
                { type: 'table', title: `Componentes de la cotización ${cotizacionId}`, data: { rows: compact, total: componentes.length } },
            ],
            limits: componentes.length > 60 ? { truncated: true, reason: 'Se recortó a 60 filas' } : undefined,
        };
    },
};
