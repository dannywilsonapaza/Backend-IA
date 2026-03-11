import { PREDEFINED_QUERIES } from './predefinedQueries.js';
import { fmt } from '../utils/format.js';
// Respuesta fast-path para consultas predefinidas (sin LLM)
export function handlePredefinedQuery(queryId, cotizacionDetalle, similares, cliente, temporada) {
    const query = PREDEFINED_QUERIES.find(q => q.id === queryId);
    if (!query?.fastPath)
        return null;
    const normCot = cotizacionDetalle;
    switch (queryId) {
        case 'resumen-general':
            return buildResumenGeneral(normCot);
        case 'precio-actual':
            return buildPrecioActual(normCot);
        case 'costo-actual':
            return buildCostoActual(normCot);
        case 'markup-actual':
            return buildMarkupActual(normCot);
        case 'info-cliente':
            return buildInfoCliente(normCot, cliente, temporada);
        case 'detalles-especificos':
            return buildDetallesEspecificos(normCot);
        default:
            return null;
    }
}
function buildResumenGeneral(normCot) {
    const id = normCot?.TCODICOTI ?? 'N/D';
    const estilo = normCot?.TCODIESTICLIE ?? 'N/D';
    const temporadaVal = normCot?.TCODITEMP ?? 'N/D';
    const precio = Number(normCot?.TPRECCOTI ?? 0);
    const costo = Number(normCot?.TCOSTPOND ?? 0);
    const markup = normCot?.TMKUPOBJE;
    let result = `📋 RESUMEN GENERAL\n\n`;
    result += `• Cotización: #${id}\n`;
    result += `• Estilo: ${estilo}\n`;
    result += `• Temporada: ${fmt.season(temporadaVal)}\n`;
    result += `• Precio: ${fmt.money(precio)}`;
    if (precio === 0)
        result += ` (pendiente de definir)`;
    result += `\n`;
    result += `• Costo: ${fmt.money(costo)}\n`;
    result += `• Markup: ${fmt.pct(markup)}`;
    if (!markup && precio === 0) {
        result += `\n\nℹ️ Nota: Esta cotización aún no tiene precio ni markup definidos`;
    }
    else if (precio === 0) {
        result += `\n\nℹ️ Nota: Esta cotización aún no tiene precio establecido`;
    }
    return result;
}
function buildPrecioActual(normCot) {
    const precioActual = Number(normCot?.TPRECCOTI ?? 0);
    const markupActual = normCot?.TMKUPOBJE;
    let result = `💰 PRECIO ACTUAL\n\n`;
    result += `• Precio de cotización: ${fmt.money(precioActual)}`;
    if (precioActual === 0)
        result += ` (pendiente de definir)`;
    result += `\n`;
    result += `• Markup objetivo: ${fmt.pct(markupActual)}`;
    if (precioActual === 0) {
        result += `\n\nℹ️ Nota: Establece un precio para evaluar la competitividad`;
    }
    return result;
}
function buildCostoActual(normCot) {
    const costoActual = Number(normCot?.TCOSTPOND ?? 0);
    const precioRef = Number(normCot?.TPRECCOTI ?? 0);
    let result = `📊 COSTO PONDERADO\n\n`;
    result += `• Costo ponderado: ${fmt.money(costoActual)}\n`;
    result += `• Precio de referencia: ${fmt.money(precioRef)}`;
    if (precioRef > 0 && costoActual > 0) {
        const margen = ((precioRef - costoActual) / precioRef * 100);
        result += `\n• Margen calculado: ${margen.toFixed(2)}%`;
    }
    return result;
}
function buildMarkupActual(normCot) {
    const markupVal = normCot?.TMKUPOBJE;
    let result = `📈 MARKUP OBJETIVO\n\n`;
    result += `• Markup: ${fmt.pct(markupVal)}`;
    if (!markupVal || markupVal === 'undefined') {
        result += `\n\nℹ️ Nota: Define un markup objetivo para establecer márgenes de rentabilidad`;
    }
    return result;
}
function buildInfoCliente(normCot, cliente, temporada) {
    const clienteInfo = normCot?.TABRVCLIE ?? cliente ?? 'N/D';
    const divisionRaw = normCot?.TDESCDIVICLIE ?? 'N/D';
    const estiloInfo = normCot?.TCODIESTICLIE ?? 'N/D';
    const temporadaInfo = normCot?.TCODITEMP ?? temporada ?? 'N/D';
    // Extraer nombre limpio de la división
    const divisionMatch = String(divisionRaw).match(/^\d+\s+(.+)$/);
    const divisionNombre = divisionMatch ? divisionMatch[1] : divisionRaw;
    let result = `👤 INFORMACIÓN DEL CLIENTE\n\n`;
    result += `• Cliente: ${clienteInfo}\n`;
    result += `• División: ${divisionNombre}\n`;
    result += `• Estilo: ${estiloInfo}\n`;
    result += `• Temporada: ${fmt.season(temporadaInfo)}`;
    return result;
}
function buildDetallesEspecificos(normCot) {
    const tipoCoti = normCot?.TDESCTIPOCOTI ?? 'N/D';
    const anioBase = normCot?.TANIOBASE ?? 'N/D';
    const prendas12 = normCot?.TPRENDAS12 ?? 0;
    const prendasEsti = normCot?.TPRENESTI ?? 'N/D';
    const comisionAgen = normCot?.TPORCGASTCOMIAGEN;
    let result = `🔍 DETALLES ESPECÍFICOS\n\n`;
    result += `• Tipo de cotización: ${fmt.na(tipoCoti)}\n`;
    result += `• Año base: ${fmt.na(anioBase)}\n`;
    result += `• Prendas 12 meses: ${Number(prendas12).toLocaleString()}\n`;
    result += `• Prendas estimadas: ${fmt.na(prendasEsti)}\n`;
    result += `• Comisión agente: ${comisionAgen != null && comisionAgen !== 'undefined' ? `${Number(comisionAgen).toFixed(2)}%` : 'N/D'}`;
    return result;
}
// Generar respuesta de datos forzada (fallback)
export function buildForcedDatosResponse(queryId, normCot, cotizacionId, cliente, temporada) {
    const nc = normCot || {};
    switch (queryId) {
        case 'resumen-general': {
            const idVal = nc.TCODICOTI ?? cotizacionId ?? 'N/D';
            const estilo = nc.TCODIESTICLIE ?? 'N/D';
            const temp = nc.TCODITEMP ?? 'N/D';
            const precio = Number(nc.TPRECCOTI ?? 0);
            const costo = Number(nc.TCOSTPOND ?? 0);
            const markup = nc.TMKUPOBJE;
            let r = `📋 RESUMEN GENERAL\n\n`;
            r += `• Cotización: #${idVal}\n`;
            r += `• Estilo: ${estilo}\n`;
            r += `• Temporada: ${fmt.season(temp)}\n`;
            r += `• Precio: ${fmt.money(precio)}`;
            if (precio === 0)
                r += ` (pendiente de definir)`;
            r += `\n• Costo: ${fmt.money(costo)}\n`;
            r += `• Markup: ${fmt.pct(markup)}`;
            if (!markup && precio === 0)
                r += `\n\nℹ️ Nota: Esta cotización aún no tiene precio ni markup definidos`;
            else if (precio === 0)
                r += `\n\nℹ️ Nota: Esta cotización aún no tiene precio establecido`;
            return r;
        }
        case 'precio-actual': {
            const precio = Number(nc.TPRECCOTI ?? 0);
            const markup = nc.TMKUPOBJE;
            let r = `💰 PRECIO ACTUAL\n\n`;
            r += `• Precio de cotización: ${fmt.money(precio)}`;
            if (precio === 0)
                r += ` (pendiente de definir)`;
            r += `\n• Markup objetivo: ${fmt.pct(markup)}`;
            if (precio === 0)
                r += `\n\nℹ️ Nota: Establece un precio para evaluar la competitividad`;
            return r;
        }
        case 'costo-actual': {
            const costo = Number(nc.TCOSTPOND ?? 0);
            const precio = Number(nc.TPRECCOTI ?? 0);
            let r = `📊 COSTO PONDERADO\n\n`;
            r += `• Costo ponderado: ${fmt.money(costo)}\n`;
            r += `• Precio de referencia: ${fmt.money(precio)}`;
            if (precio > 0 && costo > 0) {
                const margen = ((precio - costo) / precio * 100);
                r += `\n• Margen calculado: ${margen.toFixed(2)}%`;
            }
            return r;
        }
        case 'markup-actual': {
            const markup = nc.TMKUPOBJE;
            let r = `📈 MARKUP OBJETIVO\n\n`;
            r += `• Markup: ${fmt.pct(markup)}`;
            if (!markup || markup === 'undefined')
                r += `\n\nℹ️ Nota: Define un markup objetivo para establecer márgenes de rentabilidad`;
            return r;
        }
        case 'info-cliente': {
            const cli = nc.TABRVCLIE ?? cliente ?? 'N/D';
            const divRaw = nc.TDESCDIVICLIE ?? 'N/D';
            const estilo = nc.TCODIESTICLIE ?? 'N/D';
            const temp = nc.TCODITEMP ?? temporada ?? 'N/D';
            const divMatch = String(divRaw).match(/^\d+\s+(.+)$/);
            const divNombre = divMatch ? divMatch[1] : divRaw;
            let r = `👤 INFORMACIÓN DEL CLIENTE\n\n`;
            r += `• Cliente: ${cli}\n`;
            r += `• División: ${divNombre}\n`;
            r += `• Estilo: ${estilo}\n`;
            r += `• Temporada: ${fmt.season(temp)}`;
            return r;
        }
        case 'detalles-especificos': {
            const tipo = nc.TDESCTIPOCOTI ?? 'N/D';
            const anio = nc.TANIOBASE ?? 'N/D';
            const p12 = nc.TPRENDAS12 ?? 0;
            const pEst = nc.TPRENESTI ?? 'N/D';
            const com = nc.TPORCGASTCOMIAGEN;
            let r = `🔍 DETALLES ESPECÍFICOS\n\n`;
            r += `• Tipo de cotización: ${fmt.na(tipo)}\n`;
            r += `• Año base: ${fmt.na(anio)}\n`;
            r += `• Prendas 12 meses: ${Number(p12).toLocaleString()}\n`;
            r += `• Prendas estimadas: ${fmt.na(pEst)}\n`;
            r += `• Comisión agente: ${com != null && com !== 'undefined' ? `${Number(com).toFixed(2)}%` : 'N/D'}`;
            return r;
        }
        default:
            return '';
    }
}
