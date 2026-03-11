import { getColoresCotizacion } from './backendPrincipalApi.js';
function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}
function colorKey(c) {
    const tipocoln = (c.tipocoln ?? c.TTIPOCOLN ?? c.TIPOCOLN ?? '').toString().trim();
    const numecoln = (c.numecoln ?? c.TNUMECOLN ?? c.NUMECOLN ?? '').toString().trim();
    const numecolo = (c.numecolo ?? c.TNUMECOLO ?? c.NUMECOLO ?? '').toString().trim();
    return [tipocoln, numecoln, numecolo].filter(Boolean).join('|');
}
function normalizeColor(c) {
    return {
        tipocoln: c.tipocoln ?? c.TTIPOCOLN ?? c.TIPOCOLN ?? null,
        desctipocoln: c.desctipocoln ?? c.TDESCTIPOCOLN ?? null,
        numecoln: c.numecoln ?? c.TNUMECOLN ?? c.NUMECOLN ?? null,
        desccoln: c.desccoln ?? c.TDESCCOLN ?? null,
        numecolo: c.numecolo ?? c.TNUMECOLO ?? c.NUMECOLO ?? null,
        porcpart: c.porcpart ?? c.TPORCPART ?? c.PORCPART ?? null,
        inditona: c.inditona ?? c.TINDITONA ?? null,
    };
}
export const compareColorsTool = {
    id: 'compare.colors',
    description: 'Compara los colores entre dos cotizaciones (intersección y diferencias).',
    requiredParams: ['cotizacionA', 'cotizacionB'],
    examples: ['compara colores 21534 con 21454', 'diferencias de colores entre 21534 y 21454'],
    execute: async (params, ctx) => {
        const cotizacionA = toNumber(params.cotizacionA ?? params.a ?? params.cotizacionIdA);
        const cotizacionB = toNumber(params.cotizacionB ?? params.b ?? params.cotizacionIdB);
        if (!cotizacionA || !cotizacionB) {
            return {
                intent: 'compare.colors',
                entities: { cotizacionA: cotizacionA ?? null, cotizacionB: cotizacionB ?? null },
                artifacts: [
                    { type: 'warning', title: 'Faltan IDs', data: { message: 'Necesito 2 IDs de cotización para comparar colores.' } }
                ],
            };
        }
        const [ra, rb] = await Promise.all([
            getColoresCotizacion(cotizacionA, ctx.apiTrace),
            getColoresCotizacion(cotizacionB, ctx.apiTrace)
        ]);
        if (!ra.success || !rb.success) {
            return {
                intent: 'compare.colors',
                entities: { cotizacionA, cotizacionB },
                artifacts: [
                    {
                        type: 'warning',
                        title: 'Error consultando colores',
                        data: {
                            message: 'No se pudieron obtener los colores de ambas cotizaciones.',
                            a: { success: ra.success, message: ra.message ?? null },
                            b: { success: rb.success, message: rb.message ?? null },
                        }
                    }
                ],
            };
        }
        const aRows = (ra.data ?? []);
        const bRows = (rb.data ?? []);
        const aMap = new Map();
        for (const c of aRows)
            aMap.set(colorKey(c), c);
        const bMap = new Map();
        for (const c of bRows)
            bMap.set(colorKey(c), c);
        const onlyInA = [];
        const onlyInB = [];
        const common = [];
        for (const [k, v] of aMap.entries()) {
            if (bMap.has(k))
                common.push(normalizeColor(v));
            else
                onlyInA.push(normalizeColor(v));
        }
        for (const [k, v] of bMap.entries()) {
            if (!aMap.has(k))
                onlyInB.push(normalizeColor(v));
        }
        const summary = `Comparación de colores: ${cotizacionA} vs ${cotizacionB}. ` +
            `Comunes: ${common.length}. Solo en ${cotizacionA}: ${onlyInA.length}. Solo en ${cotizacionB}: ${onlyInB.length}.`;
        return {
            intent: 'compare.colors',
            entities: { cotizacionA, cotizacionB },
            artifacts: [
                { type: 'summary', title: 'Resumen', data: { text: summary } },
                {
                    type: 'diff',
                    title: 'Diferencias de colores',
                    data: {
                        counts: { common: common.length, onlyInA: onlyInA.length, onlyInB: onlyInB.length },
                        common: common.slice(0, 200),
                        onlyInA: onlyInA.slice(0, 200),
                        onlyInB: onlyInB.slice(0, 200),
                    }
                }
            ],
            limits: (common.length + onlyInA.length + onlyInB.length) > 600
                ? { truncated: true, reason: 'Se recortó a 200 filas por grupo' }
                : undefined,
        };
    },
};
