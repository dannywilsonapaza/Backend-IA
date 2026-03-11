// Normalizar detalle de cotización
export function normalizeCotizacion(cotizacionDetalle, cotizacionId) {
    if (!cotizacionDetalle)
        return null;
    return {
        TCODICOTI: cotizacionDetalle.TCODICOTI ?? cotizacionId,
        TCODIESTICLIE: cotizacionDetalle.TCODIESTICLIE,
        TCODIESTINETT: cotizacionDetalle.TCODIESTINETT,
        TNUMEVERSESTINETT: cotizacionDetalle.TNUMEVERSESTINETT,
        TABRVCLIE: cotizacionDetalle.TDESCDIVICLIEABRV || cotizacionDetalle.TDESCDIVICLIE,
        TDESCDIVICLIE: cotizacionDetalle.TDESCDIVICLIE,
        TDESCDIVICLIEABRV: cotizacionDetalle.TDESCDIVICLIEABRV,
        TDESCPREN: cotizacionDetalle.TDESCPREN,
        TCOMPPRIN: cotizacionDetalle.TCOMPPRIN?.trim(),
        TCODITELA: cotizacionDetalle.TCODITELA,
        TDESCTELA: cotizacionDetalle.TDESCTELA,
        TCODITEMP: cotizacionDetalle.TCODITEMP,
        TTIPOCOTI: cotizacionDetalle.TTIPOCOTI,
        TDESCTIPOCOTI: cotizacionDetalle.TDESCTIPOCOTI,
        TESTACOTI: cotizacionDetalle.TESTACOTI,
        TDESCESTACOTI: cotizacionDetalle.TDESCESTACOTI,
        TCOSTPOND: cotizacionDetalle.TCOSTPOND ?? 0,
        TPRECCOTI: cotizacionDetalle.TPRECCOTI ?? 0,
        TPRECCOTIMELA: cotizacionDetalle.TPRECCOTIMELA,
        MARKUP: cotizacionDetalle.MARKUP,
        TMKUPOBJE: cotizacionDetalle.MARKUP,
        TPRENESTI: cotizacionDetalle.TPRENESTI,
        TPRENDAS12: cotizacionDetalle.TPRENDAS12 ?? 0,
        TPESOESTMPREN: cotizacionDetalle.TPESOESTMPREN,
        TCANTPRENPROY: cotizacionDetalle.TCANTPRENPROY,
        TPORCGASTCOMIAGEN: cotizacionDetalle.TPORCGASTCOMIAGEN,
        TFECHCREA: cotizacionDetalle.TFECHCREA,
        TFECHMODI: cotizacionDetalle.TFECHMODI,
        TANIOBASE: cotizacionDetalle.TANIOBASE,
        TMES_BASE: cotizacionDetalle.TMES_BASE,
    };
}
// Filtrar y ordenar cotizaciones similares
export function filterSimilares(rows, cotizacionId, cotizacionDetalle, filtrarPorTemporada, filtrarPorCliente, filtrarPorTipo) {
    const temporada = cotizacionDetalle?.TCODITEMP || '';
    // Estilo cliente: código (TCODIESTICLIE) o descripción (TDESCDIVICLIE)
    const estiloCliCodigo = (cotizacionDetalle?.TCODIESTICLIE || '').toString().trim();
    const estiloCliDesc = (cotizacionDetalle?.TDESCDIVICLIE || '').toString().trim();
    const baseCosto = cotizacionDetalle?.TCOSTPOND ?? 0;
    return rows
        .filter(r => {
        // Excluir la cotización actual
        if (Number(r.TCODICOTI) === Number(cotizacionId))
            return false;
        // Filtrar por temporada si se solicita
        if (filtrarPorTemporada && temporada) {
            const rowTemp = (r.TCODITEMP || '').toString().trim();
            if (rowTemp !== temporada)
                return false;
        }
        // Filtrar por estilo cliente si se solicita (TCODIESTICLIE O TDESCDIVICLIE)
        if (filtrarPorCliente) {
            const rowEstiloCliCodigo = (r.TCODIESTICLIE || '').toString().trim();
            const rowEstiloCliDesc = (r.TDESCDIVICLIE || '').toString().trim();
            // Match por código O por descripción (igual que el frontend)
            const matchCodigo = estiloCliCodigo && rowEstiloCliCodigo === estiloCliCodigo;
            const matchDesc = estiloCliDesc && rowEstiloCliDesc === estiloCliDesc;
            if (!matchCodigo && !matchDesc)
                return false;
        }
        // Filtrar por tipo de prenda si se solicita
        if (filtrarPorTipo && cotizacionDetalle?.TTIPOCOTI) {
            const rowTipo = (r.TTIPOCOTI || '').toString().trim();
            if (rowTipo !== cotizacionDetalle.TTIPOCOTI)
                return false;
        }
        return true;
    })
        .sort((a, b) => {
        const costoA = Number(a.TCOSTPOND) || 0;
        const costoB = Number(b.TCOSTPOND) || 0;
        // Priorizar los que tienen costo > 0
        if (costoA > 0 && costoB === 0)
            return -1;
        if (costoB > 0 && costoA === 0)
            return 1;
        // Ordenar por cercanía de costo al base
        return Math.abs(costoA - baseCosto) - Math.abs(costoB - baseCosto);
    })
        .slice(0, 3)
        .map(r => ({
        id: Number(r.TCODICOTI),
        codigoCliente: String(r.TCODIESTICLIE || ''),
        temporada: String(r.TCODITEMP || ''),
        costoPonderado: Number(r.TCOSTPOND) || 0,
        precioCotizacion: Number(r.TPRECCOTI) || 0,
        markup: r.TMKUPOBJE ?? r.MARKUP ?? undefined
    }));
}
// Construir información de cotización para el prompt
export function buildCotizacionInfo(normCot) {
    let info = `
 COTIZACIÓN #${normCot.TCODICOTI}:
 - Cliente: ${normCot.TABRVCLIE}
 - Estilo Cliente: ${normCot.TCODIESTICLIE}
 ${normCot.TDESCPREN ? `- Prenda: ${normCot.TDESCPREN}` : ''}
 ${normCot.TCODIESTINETT ? `- Estilo Nettalco: ${normCot.TCODIESTINETT}${normCot.TNUMEVERSESTINETT ? ' v' + normCot.TNUMEVERSESTINETT : ''}` : ''}
 ${normCot.TCOMPPRIN ? `- Componente Principal: ${normCot.TCOMPPRIN}` : ''}
 - Temporada: ${normCot.TCODITEMP}
 - Tipo: ${normCot.TDESCTIPOCOTI || normCot.TTIPOCOTI}
 ${normCot.TDESCESTACOTI ? `- Estado: ${normCot.TDESCESTACOTI}` : (normCot.TESTACOTI ? `- Estado: ${normCot.TESTACOTI}` : '')}
 - Costo Ponderado: $${normCot.TCOSTPOND}
 - Precio Cotización: $${normCot.TPRECCOTI}
 ${normCot.TPRECCOTIMELA ? `- Precio MELA: $${normCot.TPRECCOTIMELA}` : ''}
 ${normCot.MARKUP != null ? `- Markup: ${normCot.MARKUP}%` : ''}
 ${normCot.TPRENESTI ? `- Prendas Estimadas: ${normCot.TPRENESTI}` : ''}
 ${normCot.TPRENDAS12 ? `- Prendas 12 meses: ${normCot.TPRENDAS12}` : ''}
 ${normCot.TPESOESTMPREN ? `- Peso por prenda: ${normCot.TPESOESTMPREN} kg` : ''}
 ${normCot.TPORCGASTCOMIAGEN != null ? `- Comisión Agente: ${normCot.TPORCGASTCOMIAGEN}%` : ''}
 ${normCot.TANIOBASE ? `- Año Base: ${normCot.TANIOBASE}${normCot.TMES_BASE ? '-' + normCot.TMES_BASE : ''}` : ''}
 ${normCot.TFECHCREA ? `- Fecha Creación: ${new Date(normCot.TFECHCREA).toLocaleDateString()}` : ''}
 ${normCot.TFECHMODI ? `- Última Modificación: ${new Date(normCot.TFECHMODI).toLocaleDateString()}` : ''}`;
    // Limpiar líneas vacías y N/D
    return info
        .split('\n')
        .map(l => l.replace(/\bN\/D\b/g, '').replace(/\s+\(\)/, '').trimEnd())
        .filter(l => l.trim() !== '')
        .join('\n');
}
// Construir sección de similares para el prompt
export function buildSimilaresSection(similares, needsSimilares) {
    if (!needsSimilares)
        return '';
    if (similares.length === 0) {
        return `\n\n📊 COTIZACIONES SIMILARES: No se encontraron cotizaciones similares para comparar.`;
    }
    const similaresText = similares.map((s) => {
        const parts = [`#${s.id}`, s.codigoCliente || '', s.temporada || '', `Costo: $${s.costoPonderado ?? 0}`, `Precio: $${s.precioCotizacion ?? 0}`];
        if (s.markup != null)
            parts.push(`Markup: ${s.markup}%`);
        return '- ' + parts.filter(Boolean).join(' | ');
    }).join('\n');
    return `\n\n📊 COTIZACIONES SIMILARES (${similares.length} encontradas):\n${similaresText}`;
}
// Construir respuesta por defecto (sin IA)
export function buildDefaultReply(similares) {
    if (!similares.length)
        return 'No hay similares';
    return similares
        .map((s) => {
        const mk = s.markup;
        const mkTxt = mk == null ? 'N/D' : (mk > 1 ? `${mk}%` : `${(mk * 100).toFixed(1)}%`);
        return `• #${s.id}, ${s.codigoCliente}, ${s.temporada} | Costo Ponderado $${(s.costoPonderado ?? 0).toFixed(2)} | Precio Cotización $${(s.precioCotizacion ?? 0).toFixed(2)}  Markup ${mkTxt}`;
    })
        .join('\n');
}
