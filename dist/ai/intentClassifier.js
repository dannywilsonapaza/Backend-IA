// Detectar intención específica del mensaje
export function detectIntent(msg) {
    const t = msg.toLowerCase().trim();
    // Saludos
    if (/^(hola|buenas?|hello|hey|hi)(!|\.)?$/i.test(t)) {
        return 'greeting';
    }
    // Datos simples (fast-path)
    if (/^(precio|costo|markup|margen|cliente|temporada|estado|estilo)$/i.test(t)) {
        return 'dato-simple';
    }
    // Precio sugerencia - Usuario quiere saber qué precio poner
    if (/(mejor precio|precio.*(suger|optim|ideal|recomen|poner|deberia)|que precio|cual.*(precio|seria.*precio)|suger.*precio|precio.*(poner|colocar|establecer))/i.test(t)) {
        return 'precio-sugerencia';
    }
    // Comparación explícita - Usuario quiere comparar
    if (/(compar|vs|versus|diferencia|similar|como esta.*respecto|respecto a)/i.test(t)) {
        return 'comparacion';
    }
    // Explicación - Usuario quiere entender algo
    if (/(por\s*qu[eé]|explica|como se calcul|de donde sale|significa|que es)/i.test(t)) {
        return 'explicacion';
    }
    // Recomendación general
    if (/(recomien|suger|optim|mejorar|que (me |)sugieres|como (puedo|podria)|deberia)/i.test(t)) {
        return 'recomendacion';
    }
    return 'consulta-general';
}
// Clasificación para compatibilidad con el sistema anterior
export function classifyMessage(mensaje) {
    const intent = detectIntent(mensaje);
    const isGreetingMode = intent === 'greeting';
    const wantsDetail = ['comparacion', 'recomendacion', 'precio-sugerencia'].includes(intent);
    const needsSimilares = ['comparacion', 'precio-sugerencia', 'recomendacion'].includes(intent);
    const classification = intent === 'greeting' ? 'greeting'
        : intent === 'dato-simple' ? 'data-only'
            : wantsDetail ? 'detalle'
                : 'default';
    return {
        intent,
        classification,
        isGreetingMode,
        wantsDetail,
        needsSimilares,
    };
}
