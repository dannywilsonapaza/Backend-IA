import { Router } from 'express';
import crypto from 'crypto';
import { config, isOpenAiProvider, isOllamaProvider } from '../config/env.js';
import { cacheListaSet, cacheListaGet } from '../cache/listaCache.js';
import { detectConversationState, generateMenuResponse, generateMainMenuResponse, getMenuOptions, processMenuSelection, addNavigationOptionsToResponse } from '../menus/menuHandlers.js';
import { DATOS_QUERY_IDS, COMPARACION_QUERY_IDS, QUERY_TO_GRUPO, resolveQueryAlias, getQueryById } from '../queries/predefinedQueries.js';
import { handlePredefinedQuery, buildForcedDatosResponse } from '../queries/fastPathHandler.js';
import { classifyMessage } from '../ai/intentClassifier.js';
import { getSystemPrompt } from '../ai/systemPrompts.js';
import { callOpenAI } from '../ai/providers/openai.js';
import { callOllama } from '../ai/providers/ollama.js';
import { trimToLines, trimToChars, fmt } from '../utils/format.js';
import { normalizeCotizacion, filterSimilares, buildCotizacionInfo, buildSimilaresSection, buildDefaultReply } from '../utils/cotizacion.js';
import { ejecutarComparacionCompleta } from '../services/comparacionService.js';
const router = Router();
/**
 * Genera un análisis simple de KPIs cuando no hay proveedor de IA disponible
 */
function generarAnalisisSimple(kpis) {
    const { diferencias, cotizacionActual, cotizacionAnterior } = kpis;
    const partes = [];
    // Evaluar precio FOB
    if (diferencias.precioFob > 0) {
        partes.push(`El precio FOB ha aumentado $${diferencias.precioFob.toFixed(2)} respecto a la temporada ${cotizacionAnterior.temporada}.`);
    }
    else if (diferencias.precioFob < 0) {
        partes.push(`El precio FOB ha disminuido $${Math.abs(diferencias.precioFob).toFixed(2)} respecto a la temporada ${cotizacionAnterior.temporada}.`);
    }
    // Evaluar costo ponderado
    if (diferencias.costoPonderado > 0) {
        partes.push(`Los costos han aumentado $${diferencias.costoPonderado.toFixed(2)}.`);
    }
    else if (diferencias.costoPonderado < 0) {
        partes.push(`Los costos han disminuido $${Math.abs(diferencias.costoPonderado).toFixed(2)}.`);
    }
    // Evaluar markup
    if (diferencias.markup > 0) {
        partes.push(`El markup mejoró ${diferencias.markup.toFixed(1)} puntos porcentuales.`);
    }
    else if (diferencias.markup < 0) {
        partes.push(`El markup se redujo ${Math.abs(diferencias.markup).toFixed(1)} puntos porcentuales.`);
    }
    // Conclusión
    if (diferencias.markup >= 0 && diferencias.precioFob >= 0) {
        partes.push('En general, la cotización actual muestra una evolución favorable.');
    }
    else if (diferencias.markup < 0) {
        partes.push('Se recomienda revisar la estructura de costos para mejorar el margen.');
    }
    return partes.join(' ');
}
router.post('/api/ai/cotizaciones/sugerencias', async (req, res) => {
    const t0 = Date.now();
    const body = req.body || {};
    const { cotizacionId, detalleCotizacion = null, listaCotizaciones = null, listaHash = null, predefinedQueryId = null } = body;
    let mensaje = body.mensaje || '';
    // Extraer datos para filtrar cotizaciones similares
    const cotizacionDetalle = detalleCotizacion;
    const temporada = cotizacionDetalle?.TCODITEMP || '';
    const cliente = cotizacionDetalle?.TDESCDIVICLIEABRV || cotizacionDetalle?.TDESCDIVICLIE || cotizacionDetalle?.TABRVCLIE || '';
    // Estilo cliente: código y descripción (para filtrar por ambos)
    const estiloCliCodigo = (cotizacionDetalle?.TCODIESTICLIE || '').toString().trim();
    const estiloCliDesc = (cotizacionDetalle?.TDESCDIVICLIE || '').toString().trim();
    // Log controlado
    const listaIsArray = Array.isArray(listaCotizaciones);
    console.log('[ai][incoming]', {
        cotizacionId,
        mensaje,
        cliente,
        estiloCliCodigo,
        estiloCliDesc,
        detalle: cotizacionDetalle ? {
            TCODICOTI: cotizacionDetalle.TCODICOTI,
            TCODIESTICLIE: cotizacionDetalle.TCODIESTICLIE,
            TDESCDIVICLIE: cotizacionDetalle.TDESCDIVICLIE,
            TCODITEMP: cotizacionDetalle.TCODITEMP,
            TPRECCOTI: cotizacionDetalle.TPRECCOTI,
            TCOSTPOND: cotizacionDetalle.TCOSTPOND,
            MARKUP: cotizacionDetalle.MARKUP
        } : null,
        listaCotizaciones: listaIsArray ? `${listaCotizaciones.length} items` : null
    });
    // Procesar cotizaciones similares
    const providedHash = typeof listaHash === 'string' ? listaHash : null;
    const hasLista = Array.isArray(listaCotizaciones) && listaCotizaciones.length > 0;
    let dataSource = hasLista ? 'client' : 'none';
    let cacheStatus = 'none';
    // Obtener lista de cache si solo viene hash
    let rows = [];
    if (hasLista) {
        rows = listaCotizaciones;
        const serverHash = providedHash || crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 8);
        cacheListaSet(serverHash, rows);
        cacheStatus = 'store';
        res.set('X-AI-Lista-Hash', serverHash);
    }
    else if (providedHash) {
        const cached = cacheListaGet(providedHash);
        if (cached) {
            rows = cached;
            dataSource = 'client';
            cacheStatus = 'hit';
        }
    }
    // Determinar tipo de filtro
    const queryType = mensaje.trim().toLowerCase();
    const filtrarPorTemporada = queryType === 'similares-temporada' || predefinedQueryId === 'similares-temporada';
    const filtrarPorCliente = queryType === 'similares-cliente' || predefinedQueryId === 'similares-cliente';
    const filtrarPorTipo = queryType === 'similares-tipo' || predefinedQueryId === 'similares-tipo';
    // Filtrar y ordenar cotizaciones similares
    const similares = filterSimilares(rows, cotizacionId, cotizacionDetalle, filtrarPorTemporada, filtrarPorCliente, filtrarPorTipo);
    // Log de similares encontrados
    if (similares.length > 0) {
        console.log('[ai][similares]', similares.map(s => ({
            id: s.id,
            costo: s.costoPonderado,
            precio: s.precioCotizacion,
            markup: s.markup ?? 'N/D'
        })));
    }
    // Headers de debug
    res.set('X-AI-Lista-Count', String(rows.length));
    res.set('X-AI-Similares-Count', String(similares.length));
    if (providedHash)
        res.set('X-AI-Lista-Hash', providedHash);
    if (cacheStatus !== 'none')
        res.set('X-AI-Cache-Status', cacheStatus);
    const filtroAplicado = filtrarPorTemporada ? 'temporada' : filtrarPorCliente ? 'estilo-cliente' : filtrarPorTipo ? 'tipo' : 'ninguno';
    res.set('X-AI-Filtro', filtroAplicado);
    if (filtrarPorTemporada)
        res.set('X-AI-Temporada-Filtro', temporada);
    if (filtrarPorCliente)
        res.set('X-AI-EstiloCliente-Filtro', `${estiloCliCodigo}|${estiloCliDesc}`);
    // Respuesta por defecto
    const reply = buildDefaultReply(similares);
    // Clasificar mensaje
    const trimmedMensaje = (mensaje || '').trim();
    const { intent, classification, isGreetingMode, wantsDetail, needsSimilares } = classifyMessage(trimmedMensaje);
    res.set('X-AI-Mode', classification);
    res.set('X-AI-Intent', intent);
    res.set('X-AI-Respuesta-Detallada', wantsDetail ? 'true' : 'false');
    const maxLines = wantsDetail ? 12 : (isGreetingMode ? 1 : 5);
    const normCot = normalizeCotizacion(cotizacionDetalle, cotizacionId);
    // ============== FLUJO CONVERSACIONAL ==============
    const conversationState = detectConversationState(mensaje);
    // Manejar saludos
    if (conversationState === 'greeting') {
        const menuResponse = generateMainMenuResponse(cotizacionId);
        const menuOptions = getMenuOptions('main');
        res.set('X-AI-Provider', 'conversational-menu');
        res.set('X-AI-Menu-Type', 'main');
        const tEnd = Date.now();
        res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, conversational: true }));
        return res.json({
            reply: menuResponse,
            similares: [],
            confidence: 1.0,
            provider: 'conversational-menu',
            menuType: 'main',
            dataSource,
            listaHash: providedHash || res.get('X-AI-Lista-Hash') || null,
            cacheStatus,
            isMenu: true,
            menuOptions,
            menuTitle: 'Menú Principal',
            showBackButton: false
        });
    }
    // Resolver alias de consultas
    let effectivePredefinedQueryId = predefinedQueryId;
    if (!effectivePredefinedQueryId) {
        const aliasId = resolveQueryAlias(mensaje);
        if (aliasId) {
            effectivePredefinedQueryId = aliasId;
            res.set('X-AI-Alias', aliasId);
        }
    }
    // Manejar solicitudes de menú
    if (conversationState === 'menu-request') {
        const menuSelection = processMenuSelection(mensaje, 'main');
        if (menuSelection.type === 'menu') {
            const menuResponse = generateMenuResponse(menuSelection.data.menuType, cotizacionId);
            const menuOptions = getMenuOptions(menuSelection.data.menuType);
            res.set('X-AI-Provider', 'conversational-menu');
            res.set('X-AI-Menu-Type', menuSelection.data.menuType);
            const tEnd = Date.now();
            res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, conversational: true }));
            return res.json({
                reply: menuResponse,
                similares: [],
                confidence: 1.0,
                provider: 'conversational-menu',
                menuType: menuSelection.data.menuType,
                dataSource,
                listaHash: providedHash || res.get('X-AI-Lista-Hash') || null,
                cacheStatus,
                isMenu: true,
                menuOptions,
                menuTitle: `Submenú: ${menuSelection.data.menuType}`,
                showBackButton: menuSelection.data.menuType !== 'main'
            });
        }
        else if (menuSelection.type === 'end') {
            const tEnd = Date.now();
            res.set('X-AI-Provider', 'conversational-end');
            res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, conversational: true }));
            return res.json({
                reply: menuSelection.data.message,
                similares: [],
                confidence: 1.0,
                provider: 'conversational-end',
                dataSource,
                listaHash: providedHash || res.get('X-AI-Lista-Hash') || null,
                cacheStatus,
                isMenu: false,
                conversationEnded: true
            });
        }
        else if (menuSelection.type === 'query') {
            effectivePredefinedQueryId = menuSelection.data.queryId;
            res.set('X-AI-Menu-Selection', menuSelection.data.queryId);
        }
        else {
            const menuResponse = generateMainMenuResponse(cotizacionId) + '\n\n❌ Opción no válida. Por favor elige un número del 1 al 4.';
            const menuOptions = getMenuOptions('main');
            res.set('X-AI-Provider', 'conversational-menu');
            res.set('X-AI-Menu-Type', 'main-error');
            const tEnd = Date.now();
            res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, conversational: true }));
            return res.json({
                reply: menuResponse,
                similares: [],
                confidence: 1.0,
                provider: 'conversational-menu',
                menuType: 'main',
                dataSource,
                listaHash: providedHash || res.get('X-AI-Lista-Hash') || null,
                cacheStatus,
                isMenu: true,
                menuOptions,
                menuTitle: 'Menú Principal',
                showBackButton: false
            });
        }
    }
    // ============== FAST-PATH PREDEFINIDO ==============
    if (effectivePredefinedQueryId) {
        const fastReply = handlePredefinedQuery(effectivePredefinedQueryId, normCot, similares, cliente, temporada);
        if (fastReply) {
            res.set('X-AI-Provider', 'fast-predefined');
            res.set('X-AI-Fast-Path', 'predefined');
            res.set('X-AI-Query-Id', effectivePredefinedQueryId);
            const tEnd = Date.now();
            res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, fastPath: true }));
            return res.json(addNavigationOptionsToResponse({
                reply: fastReply,
                similares,
                confidence: 0.95,
                provider: 'fast-predefined',
                queryId: effectivePredefinedQueryId,
                dataSource,
                listaHash: providedHash || res.get('X-AI-Lista-Hash') || null,
                cacheStatus
            }));
        }
        // Fallback forzado para submenú datos
        if (DATOS_QUERY_IDS.has(effectivePredefinedQueryId)) {
            const forced = buildForcedDatosResponse(effectivePredefinedQueryId, normCot, cotizacionId, cliente, temporada);
            res.set('X-AI-Provider', 'fast-predefined');
            res.set('X-AI-Fast-Path', 'predefined-fallback');
            res.set('X-AI-Query-Id', effectivePredefinedQueryId);
            const tEnd = Date.now();
            res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, fastPath: true, forcedDatos: true }));
            return res.json(addNavigationOptionsToResponse({
                reply: forced,
                similares,
                confidence: 0.95,
                provider: 'fast-predefined',
                queryId: effectivePredefinedQueryId,
                dataSource,
                listaHash: providedHash || res.get('X-AI-Lista-Hash') || null,
                cacheStatus
            }));
        }
        // ============== COMPARACIÓN CON BACKEND PRINCIPAL ==============
        if (COMPARACION_QUERY_IDS.has(effectivePredefinedQueryId)) {
            const grupo = (QUERY_TO_GRUPO[effectivePredefinedQueryId] || 'ESTILO_CLIENTE');
            console.log('[ai][comparacion] Iniciando comparación:', { cotizacionId, grupo, queryId: effectivePredefinedQueryId });
            const comparacionResult = await ejecutarComparacionCompleta(cotizacionId, grupo);
            res.set('X-AI-Query-Id', effectivePredefinedQueryId);
            res.set('X-AI-Comparacion-Grupo', grupo);
            res.set('X-AI-Comparacion-Candidatos', String(comparacionResult.totalCandidatos));
            if (!comparacionResult.success || !comparacionResult.candidatoSeleccionado) {
                // No hay candidatos para comparar
                const tEnd = Date.now();
                res.set('X-AI-Provider', 'comparacion-backend');
                res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, comparacion: true, sinCandidatos: true }));
                const mensajeError = comparacionResult.error || `No se encontraron cotizaciones de temporadas anteriores para comparar en el grupo "${grupo}".`;
                return res.json(addNavigationOptionsToResponse({
                    reply: `⚠️ ${mensajeError}\n\n💡 Puedes probar con otro grupo de comparación:\n- **Estilo Cliente**: Mismo estilo del cliente\n- **Cliente**: Cualquier estilo del mismo cliente\n- **Global**: Todas las cotizaciones anteriores`,
                    similares: [],
                    confidence: 0.9,
                    provider: 'comparacion-backend',
                    queryId: effectivePredefinedQueryId,
                    dataSource: 'backend-principal',
                    listaHash: null,
                    cacheStatus: 'none',
                    comparacion: {
                        grupo,
                        totalCandidatos: 0,
                        candidatoSeleccionado: null,
                        kpis: null
                    }
                }));
            }
            // Construir respuesta con análisis de KPIs
            const { candidatoSeleccionado, kpis, cotizacionActual, totalCandidatos } = comparacionResult;
            // Construir tabla de KPIs (parte fija)
            let tablaKPIs = `📊 **Comparación por ${grupo === 'ESTILO_CLIENTE' ? 'Estilo Cliente' : grupo === 'CLIENTE' ? 'Cliente' : 'Global'}**\n\n`;
            tablaKPIs += `🔍 Se encontraron **${totalCandidatos} cotizaciones** de temporadas anteriores.\n`;
            tablaKPIs += `✅ Se seleccionó la cotización **#${candidatoSeleccionado.COTIZACION_ID}** (Temporada: ${candidatoSeleccionado.TEMPORADA}) como la más relevante.\n\n`;
            if (kpis) {
                tablaKPIs += `📈 **Comparación de KPIs:**\n\n`;
                tablaKPIs += `| Indicador | Actual (${kpis.cotizacionActual.temporada}) | Anterior (${kpis.cotizacionAnterior.temporada}) | Diferencia |\n`;
                tablaKPIs += `|-----------|--------|----------|------------|\n`;
                // Precio FOB
                const precioVariacion = kpis.diferencias.precioFobPct !== null ? ` (${kpis.diferencias.precioFobPct > 0 ? '+' : ''}${kpis.diferencias.precioFobPct.toFixed(1)}%)` : '';
                tablaKPIs += `| **Precio FOB** | $${kpis.cotizacionActual.precioFob.toFixed(2)} | $${kpis.cotizacionAnterior.precioFob.toFixed(2)} | ${kpis.diferencias.precioFob >= 0 ? '+' : ''}$${kpis.diferencias.precioFob.toFixed(2)}${precioVariacion} |\n`;
                // Costo Ponderado
                const costoVariacion = kpis.diferencias.costoPonderadoPct !== null ? ` (${kpis.diferencias.costoPonderadoPct > 0 ? '+' : ''}${kpis.diferencias.costoPonderadoPct.toFixed(1)}%)` : '';
                tablaKPIs += `| **Costo Ponderado** | $${kpis.cotizacionActual.costoPonderado.toFixed(2)} | $${kpis.cotizacionAnterior.costoPonderado.toFixed(2)} | ${kpis.diferencias.costoPonderado >= 0 ? '+' : ''}$${kpis.diferencias.costoPonderado.toFixed(2)}${costoVariacion} |\n`;
                // Markup
                tablaKPIs += `| **Markup** | ${kpis.cotizacionActual.markup.toFixed(1)}% | ${kpis.cotizacionAnterior.markup.toFixed(1)}% | ${kpis.diferencias.markup >= 0 ? '+' : ''}${kpis.diferencias.markup.toFixed(1)} pts |\n`;
                // Prendas Estimadas
                if (kpis.cotizacionActual.prendasEstimadas || kpis.cotizacionAnterior.prendasEstimadas) {
                    const prendasVariacion = kpis.diferencias.prendasPct !== null ? ` (${kpis.diferencias.prendasPct > 0 ? '+' : ''}${kpis.diferencias.prendasPct.toFixed(1)}%)` : '';
                    tablaKPIs += `| **Prendas Est.** | ${kpis.cotizacionActual.prendasEstimadas || 'N/D'} | ${kpis.cotizacionAnterior.prendasEstimadas || 'N/D'} | ${kpis.diferencias.prendasEstimadas >= 0 ? '+' : ''}${kpis.diferencias.prendasEstimadas}${prendasVariacion} |\n`;
                }
                tablaKPIs += `\n`;
                // Generar análisis con Ollama
                let analisisIA = '';
                const tKpisListo = Date.now();
                if (isOllamaProvider() || isOpenAiProvider()) {
                    try {
                        const promptAnalisis = `Analiza la siguiente comparación de KPIs entre dos cotizaciones textiles de diferentes temporadas:

COTIZACIÓN ACTUAL (${kpis.cotizacionActual.temporada}):
- Precio FOB: $${kpis.cotizacionActual.precioFob.toFixed(2)}
- Costo Ponderado: $${kpis.cotizacionActual.costoPonderado.toFixed(2)}
- Markup: ${kpis.cotizacionActual.markup.toFixed(1)}%
- Prendas Estimadas: ${kpis.cotizacionActual.prendasEstimadas || 'N/D'}

COTIZACIÓN ANTERIOR (${kpis.cotizacionAnterior.temporada}):
- Precio FOB: $${kpis.cotizacionAnterior.precioFob.toFixed(2)}
- Costo Ponderado: $${kpis.cotizacionAnterior.costoPonderado.toFixed(2)}
- Markup: ${kpis.cotizacionAnterior.markup.toFixed(1)}%
- Prendas Estimadas: ${kpis.cotizacionAnterior.prendasEstimadas || 'N/D'}

DIFERENCIAS:
- Precio FOB: ${kpis.diferencias.precioFob >= 0 ? '+' : ''}$${kpis.diferencias.precioFob.toFixed(2)} (${kpis.diferencias.precioFobPct?.toFixed(1) || 'N/A'}%)
- Costo Ponderado: ${kpis.diferencias.costoPonderado >= 0 ? '+' : ''}$${kpis.diferencias.costoPonderado.toFixed(2)} (${kpis.diferencias.costoPonderadoPct?.toFixed(1) || 'N/A'}%)
- Markup: ${kpis.diferencias.markup >= 0 ? '+' : ''}${kpis.diferencias.markup.toFixed(1)} puntos porcentuales

Proporciona un análisis breve (3-5 oraciones) que incluya:
1. Evaluación general de la evolución (positiva/negativa)
2. Factores clave que explican los cambios
3. Una recomendación concreta para el cotizador`;
                        const systemPromptAnalisis = `Eres un experto analista de costos en la industria textil. Analiza comparaciones de cotizaciones entre temporadas de forma concisa y profesional. Responde en español, sé directo y da insights accionables. No uses formato de lista, escribe en párrafos cortos.`;
                        if (isOllamaProvider()) {
                            const result = await callOllama(systemPromptAnalisis, promptAnalisis, 400);
                            analisisIA = result.text || '';
                        }
                        else if (isOpenAiProvider()) {
                            const result = await callOpenAI(systemPromptAnalisis, promptAnalisis, 400);
                            analisisIA = result.text || '';
                        }
                        console.log('[ai][comparacion] Análisis IA generado:', analisisIA.slice(0, 100) + '...');
                    }
                    catch (error) {
                        console.error('[ai][comparacion] Error generando análisis IA:', error.message);
                        // Fallback a análisis simple si falla la IA
                        analisisIA = generarAnalisisSimple(kpis);
                    }
                }
                else {
                    // Sin proveedor de IA, usar análisis simple
                    analisisIA = generarAnalisisSimple(kpis);
                }
                tablaKPIs += `💡 **Análisis:**\n${analisisIA}\n`;
                const tEnd = Date.now();
                const providerUsed = isOllamaProvider() ? 'ollama' : isOpenAiProvider() ? 'openai' : 'comparacion-backend';
                res.set('X-AI-Provider', providerUsed);
                res.set('X-AI-Timing', JSON.stringify({
                    total: tEnd - t0,
                    comparacion: true,
                    kpis: tKpisListo - t0,
                    analisisIA: tEnd - tKpisListo
                }));
                return res.json(addNavigationOptionsToResponse({
                    reply: tablaKPIs,
                    similares: [],
                    confidence: 0.95,
                    provider: providerUsed,
                    queryId: effectivePredefinedQueryId,
                    dataSource: 'backend-principal',
                    listaHash: null,
                    cacheStatus: 'none',
                    comparacion: {
                        grupo,
                        totalCandidatos,
                        candidatoSeleccionado: {
                            id: candidatoSeleccionado.COTIZACION_ID,
                            temporada: candidatoSeleccionado.TEMPORADA,
                            estiloCliente: candidatoSeleccionado.ESTILO_CLIENTE,
                            nombreCliente: candidatoSeleccionado.NOMBRE_CLIENTE,
                            precioFob: candidatoSeleccionado.PRECIO_FOB
                        },
                        kpis: {
                            actual: kpis.cotizacionActual,
                            anterior: kpis.cotizacionAnterior,
                            diferencias: kpis.diferencias
                        }
                    }
                }));
            }
            else {
                // Sin KPIs, mostrar info básica
                tablaKPIs += `⚠️ No se pudieron obtener los KPIs detallados para la comparación.\n`;
                tablaKPIs += `\n📋 **Cotización seleccionada para comparar:**\n`;
                tablaKPIs += `- ID: #${candidatoSeleccionado.COTIZACION_ID}\n`;
                tablaKPIs += `- Temporada: ${candidatoSeleccionado.TEMPORADA}\n`;
                tablaKPIs += `- Cliente: ${candidatoSeleccionado.NOMBRE_CLIENTE}\n`;
                tablaKPIs += `- Estilo: ${candidatoSeleccionado.ESTILO_CLIENTE}\n`;
                if (candidatoSeleccionado.PRECIO_FOB) {
                    tablaKPIs += `- Precio FOB: $${candidatoSeleccionado.PRECIO_FOB}\n`;
                }
                const tEnd = Date.now();
                res.set('X-AI-Provider', 'comparacion-backend');
                res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, comparacion: true, sinKpis: true }));
                return res.json(addNavigationOptionsToResponse({
                    reply: tablaKPIs,
                    similares: [],
                    confidence: 0.85,
                    provider: 'comparacion-backend',
                    queryId: effectivePredefinedQueryId,
                    dataSource: 'backend-principal',
                    listaHash: null,
                    cacheStatus: 'none',
                    comparacion: {
                        grupo,
                        totalCandidatos,
                        candidatoSeleccionado: {
                            id: candidatoSeleccionado.COTIZACION_ID,
                            temporada: candidatoSeleccionado.TEMPORADA,
                            estiloCliente: candidatoSeleccionado.ESTILO_CLIENTE,
                            nombreCliente: candidatoSeleccionado.NOMBRE_CLIENTE,
                            precioFob: candidatoSeleccionado.PRECIO_FOB
                        },
                        kpis: null
                    }
                }));
            }
        }
        // Usar template de consulta
        const query = getQueryById(effectivePredefinedQueryId);
        if (query) {
            mensaje = query.template;
            res.set('X-AI-Query-Id', effectivePredefinedQueryId);
            res.set('X-AI-Template-Used', query.template);
        }
    }
    // ============== VALIDAR DETALLE REQUERIDO ==============
    if (!normCot) {
        return res.status(400).json({
            error: 'Se requiere detalleCotizacion',
            message: 'El campo detalleCotizacion es obligatorio'
        });
    }
    const tSimilaresListo = Date.now();
    const lowerMsg = trimmedMensaje.toLowerCase();
    // ============== DATA-ONLY LOCAL PATH ==============
    if (!similares.length && classification === 'data-only') {
        res.set('X-AI-Provider', config.provider);
        res.set('X-AI-Data-Source', 'none');
        const tEnd = Date.now();
        res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, similaresCalc: tSimilaresListo - t0 }));
        return res.json({ reply, similares: [], confidence: 0.6, provider: config.provider, model: null, openaiId: null, dataSource: 'none', listaHash: providedHash || null, cacheStatus, mode: classification });
    }
    if (classification === 'data-only') {
        const precioVal = normCot.TPRECCOTI ?? 0;
        const costoVal = normCot.TCOSTPOND ?? 0;
        const markupVal = normCot.TMKUPOBJE != null ? normCot.TMKUPOBJE : 'N/D';
        let dataReply = '';
        switch (lowerMsg) {
            case 'precio':
                dataReply = `Precio: ${precioVal}` + (markupVal !== 'N/D' ? ` (Markup ${markupVal}%)` : '');
                break;
            case 'costo':
            case 'costo ponderado':
                dataReply = `Costo Ponderado: ${costoVal}` + (precioVal ? ` (Precio ${precioVal})` : '');
                break;
            case 'cliente':
                dataReply = `Cliente: ${fmt.na(normCot.TABRVCLIE || cliente)} Estilo: ${fmt.na(normCot.TCODIESTICLIE || estiloCliCodigo)} Temporada: ${fmt.na(normCot.TCODITEMP || temporada)}`;
                break;
            case 'markup':
            case 'margen':
                dataReply = `Markup Objetivo: ${markupVal !== 'N/D' ? markupVal + '%' : 'N/D'}`;
                break;
            case 'temporada':
                dataReply = `Temporada: ${fmt.na(normCot.TCODITEMP || temporada)}`;
                break;
            case 'estado':
                dataReply = `Estado: ${fmt.na(normCot.TESTACOTI)}`;
                break;
            case 'estilo':
            case 'estilo cliente':
                dataReply = `Estilo Cliente: ${fmt.na(normCot.TCODIESTICLIE || estiloCliCodigo)}`;
                break;
            default:
                dataReply = buildDefaultReply(similares);
        }
        const similaresCompactos = similares.map(s => ({ i: s.id, p: s.precioCotizacion ?? 0, c: s.costoPonderado ?? 0, m: s.markup ?? null }));
        res.set('X-AI-Provider', 'fast-local');
        res.set('X-AI-Fast-Path', 'data-only');
        res.set('X-AI-Data-Source', dataSource);
        res.set('X-AI-Similares-Compact', 'true');
        const tEnd = Date.now();
        res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, similaresCalc: tSimilaresListo - t0, dataOnly: true }));
        return res.json(addNavigationOptionsToResponse({
            reply: dataReply,
            similares,
            similaresCompactos,
            confidence: 0.7,
            provider: 'mock',
            dataSource,
            listaHash: providedHash || res.get('X-AI-Lista-Hash') || null,
            cacheStatus,
            mode: classification
        }));
    }
    // ============== CONSTRUIR PROMPTS ==============
    const cotizacionActualInfo = buildCotizacionInfo(normCot);
    const similaresSection = buildSimilaresSection(similares, needsSimilares);
    const system = getSystemPrompt(intent, maxLines);
    let effectiveUserPrompt = `📋 COTIZACIÓN ACTUAL:
${cotizacionActualInfo}

❓ CONSULTA: "${mensaje}"${similaresSection}

⚠️ IMPORTANTE: Responde SOLO a lo que pregunta el usuario. Sé específico y directo.`;
    if (isGreetingMode) {
        effectiveUserPrompt = `Usuario saludó con: "${trimmedMensaje}". Responde SOLO con un saludo cordial y breve (1 línea) y ofrece ayuda. No analices datos ni añadas nada más.`;
        res.set('X-AI-Prompt-Slim', 'true');
    }
    // ============== LLAMAR A PROVEEDOR DE IA ==============
    const isDetailQuery = /explica|detalle|detall|analiz|competit|optimiz|mejorar|sugerenci|precio|markup|tendencia|recomend|calcul/i.test(trimmedMensaje);
    // Ollama
    if (isOllamaProvider()) {
        try {
            const numPredict = wantsDetail ? (isDetailQuery ? 1200 : 800) : (isGreetingMode ? 25 : 200);
            const result = await callOllama(system, effectiveUserPrompt, numPredict);
            let final = result.text || reply;
            final = trimToChars(final, wantsDetail ? 2500 : 1200);
            const post = trimToLines(final, maxLines);
            final = post.text;
            if (post.trimmed)
                res.set('X-AI-Post-Trim', 'true');
            res.set('X-AI-Provider', 'ollama');
            res.set('X-AI-Data-Source', dataSource);
            return res.json(addNavigationOptionsToResponse({
                reply: final,
                similares,
                confidence: 0.8,
                provider: 'ollama',
                model: result.model,
                openaiId: null,
                dataSource,
                listaHash: providedHash || res.get('X-AI-Lista-Hash') || null,
                cacheStatus
            }));
        }
        catch (e) {
            const errMsg = e?.message || 'unknown_error';
            console.error('[ai] Ollama call failed:', errMsg);
            res.set('X-AI-Provider', 'mock');
            res.set('X-AI-Data-Source', dataSource);
            res.set('X-AI-Error', String(errMsg).slice(0, 300));
            return res.json({ reply, similares, confidence: 0.75, provider: 'mock', error: errMsg, dataSource, listaHash: providedHash || res.get('X-AI-Lista-Hash') || null, cacheStatus });
        }
    }
    // OpenAI
    if (isOpenAiProvider()) {
        try {
            const maxTokens = wantsDetail ? (isDetailQuery ? 1200 : 800) : (isGreetingMode ? 25 : 200);
            const result = await callOpenAI(system, effectiveUserPrompt, maxTokens);
            let final = result.text || reply;
            final = trimToChars(final, wantsDetail ? 2500 : 1200);
            const post = trimToLines(final, maxLines);
            final = post.text;
            if (post.trimmed)
                res.set('X-AI-Post-Trim', 'true');
            res.set('X-AI-Provider', 'openai');
            res.set('X-AI-Data-Source', dataSource);
            const tEnd = Date.now();
            res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, similaresCalc: tSimilaresListo - t0, llm: tEnd - tSimilaresListo }));
            return res.json(addNavigationOptionsToResponse({
                reply: final,
                similares,
                confidence: 0.82,
                provider: 'openai',
                model: result.model,
                openaiId: result.id,
                usage: result.usage,
                dataSource,
                listaHash: providedHash || res.get('X-AI-Lista-Hash') || null,
                cacheStatus
            }));
        }
        catch (e) {
            const errMsg = e?.message || 'unknown_error';
            console.error('[ai] OpenAI call failed:', errMsg);
            res.set('X-AI-Provider', 'mock');
            res.set('X-AI-Data-Source', dataSource);
            res.set('X-AI-Error', String(errMsg).slice(0, 300));
            return res.json({ reply, similares, confidence: 0.75, provider: 'mock', error: errMsg, dataSource, listaHash: providedHash || res.get('X-AI-Lista-Hash') || null, cacheStatus });
        }
    }
    // Mock fallback
    setTimeout(() => {
        res.set('X-AI-Provider', 'mock');
        res.set('X-AI-Data-Source', dataSource);
        const tEnd = Date.now();
        res.set('X-AI-Timing', JSON.stringify({ total: tEnd - t0, similaresCalc: tSimilaresListo - t0, mockLatency: true }));
        res.json({ reply, similares, confidence: 0.75, provider: 'mock', dataSource, listaHash: providedHash || res.get('X-AI-Lista-Hash') || null, cacheStatus });
    }, 300);
});
export default router;
