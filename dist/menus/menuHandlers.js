import { CONVERSATIONAL_MENUS, NAVIGATION_OPTIONS } from './conversationalMenus.js';
// Detectar estado de la conversación basado en el mensaje
export function detectConversationState(mensaje) {
    const lowerMsg = mensaje.toLowerCase().trim();
    // Detectar saludos o inicio de conversación
    if (!lowerMsg || lowerMsg.length < 3 ||
        /^(hola|hello|hi|buenos|buenas|saludos?|hey)/.test(lowerMsg) ||
        /^(menu|opciones|ayuda|help|inicio|empezar)/.test(lowerMsg)) {
        return 'greeting';
    }
    // Detectar solicitudes de menú o navegación (incluyendo IDs específicos)
    if (/^\d+$/.test(lowerMsg) ||
        lowerMsg === 'back-main' ||
        lowerMsg === 'menu-principal' ||
        lowerMsg === 'terminar' ||
        /(datos|comparaci[oó]n|an[aá]lisis|recomendaci[oó]n|volver|atr[aá]s|menu|opciones)/.test(lowerMsg)) {
        return 'menu-request';
    }
    return 'query';
}
// Generar respuesta de menú
export function generateMenuResponse(type, cotizacionId) {
    const menu = CONVERSATIONAL_MENUS[type];
    if (!menu) {
        return generateMainMenuResponse(cotizacionId);
    }
    let response = '';
    // Agregar saludo para menú principal
    if (type === 'main' && menu.greeting) {
        response += `${menu.greeting}\n\n`;
        if (cotizacionId) {
            response += `📋 Trabajando con cotización #${cotizacionId}\n\n`;
        }
    }
    response += 'Escribe la opción que te interesa.';
    return response;
}
// Generar respuesta del menú principal
export function generateMainMenuResponse(cotizacionId) {
    return generateMenuResponse('main', cotizacionId);
}
// Obtener opciones de un menú
export function getMenuOptions(type) {
    const menu = CONVERSATIONAL_MENUS[type];
    if (!menu) {
        return CONVERSATIONAL_MENUS.main.options.map(option => ({
            id: option.id,
            label: option.label,
            description: option.description || '',
            action: option.action,
            emoji: option.label.match(/^[^\w\s]+/)?.[0] || ''
        }));
    }
    return menu.options.map(option => ({
        id: option.id,
        label: option.label,
        description: option.description || '',
        action: option.action,
        emoji: option.label.match(/^[^\w\s]+/)?.[0] || ''
    }));
}
// Procesar selección de menú
export function processMenuSelection(selection, currentMenu = 'main') {
    const lowerSelection = selection.toLowerCase().trim();
    // Opción "Volver al menú principal"
    if (lowerSelection === 'back-main' ||
        lowerSelection === 'menu-principal' ||
        lowerSelection.includes('menu principal') ||
        lowerSelection.includes('volver') ||
        (lowerSelection === '1' && currentMenu === 'navigation')) {
        return {
            type: 'menu',
            data: { menuType: 'main' }
        };
    }
    // Opción "Terminar conversación"
    if (lowerSelection === 'terminar' ||
        lowerSelection.includes('terminar') ||
        lowerSelection.includes('finalizar') ||
        (lowerSelection === '2' && currentMenu === 'navigation')) {
        return {
            type: 'end',
            data: { message: 'Conversación terminada. ¡Gracias por usar el asistente!' }
        };
    }
    const menu = CONVERSATIONAL_MENUS[currentMenu];
    if (!menu) {
        return { type: 'error' };
    }
    // Procesar selección numérica
    const num = parseInt(selection);
    if (!isNaN(num) && num >= 1 && num <= menu.options.length) {
        const option = menu.options[num - 1];
        if (option.action === 'submenu') {
            const targetMenu = option.category === 'main' ? 'main' : option.category || option.id;
            return {
                type: 'menu',
                data: { menuType: targetMenu }
            };
        }
        else if (option.action === 'query') {
            return {
                type: 'query',
                data: { queryId: option.id }
            };
        }
    }
    // Procesar selección por texto
    const matchedOption = menu.options.find(opt => opt.label.toLowerCase().includes(lowerSelection) ||
        opt.id.toLowerCase().includes(lowerSelection));
    if (matchedOption) {
        if (matchedOption.action === 'submenu') {
            const targetMenu = matchedOption.category === 'main' ? 'main' : matchedOption.category || matchedOption.id;
            return {
                type: 'menu',
                data: { menuType: targetMenu }
            };
        }
        else if (matchedOption.action === 'query') {
            return {
                type: 'query',
                data: { queryId: matchedOption.id }
            };
        }
    }
    return { type: 'error' };
}
// Agregar opciones de navegación a una respuesta
export function addNavigationOptionsToResponse(response) {
    return {
        ...response,
        isMenu: true,
        menuOptions: NAVIGATION_OPTIONS,
        menuTitle: '¿Qué te gustaría hacer ahora?',
        showBackButton: false,
        provider: response.provider || 'conversational-navigation'
    };
}
