import type { ConversationalMenus } from '../types/index.js';

export const CONVERSATIONAL_MENUS: ConversationalMenus = {
  main: {
    type: 'main',
    greeting: '¡Hola! Soy tu asistente de cotizaciones textiles. ¿En qué te puedo ayudar hoy?',
    options: [
      { id: 'datos', label: '📊 Datos', description: 'Ver información de la cotización', action: 'submenu', category: 'datos' },
      { id: 'comparacion', label: '📈 Comparación', description: 'Comparar con temporadas anteriores', action: 'submenu', category: 'comparacion' },
      { id: 'recomendacion', label: '💡 Recomendación', description: 'Sugerir precio óptimo', action: 'submenu', category: 'recomendacion' }
    ]
  },
  datos: {
    type: 'submenu',
    category: 'datos',
    options: [
      { id: 'resumen-general', label: '📋 Resumen general', description: 'Vista completa de la cotización', action: 'query' },
      { id: 'precio-actual', label: '💰 Ver precio actual', description: 'Precio de venta vigente', action: 'query' },
      { id: 'costo-actual', label: '📊 Ver costo ponderado', description: 'Costo total calculado', action: 'query' },
      { id: 'markup-actual', label: '📈 Ver markup actual', description: 'Porcentaje de ganancia', action: 'query' },
      { id: 'info-cliente', label: '🏢 Información del cliente', description: 'Datos del cliente y divisiones', action: 'query' },
      { id: 'detalles-especificos', label: '🔍 Detalles específicos', description: 'Componentes y especificaciones', action: 'query' },
      { id: 'back-main', label: '← Volver', action: 'submenu', category: 'main' }
    ]
  },
  comparacion: {
    type: 'submenu',
    category: 'comparacion',
    options: [
      { id: 'comparar-estilo-cliente', label: '👔 Por estilo cliente', description: 'Mismo estilo del cliente en temporadas anteriores', action: 'query' },
      { id: 'comparar-cliente', label: '🏢 Por cliente', description: 'Cualquier estilo del mismo cliente', action: 'query' },
      { id: 'comparar-global', label: '🌍 Global', description: 'Todas las cotizaciones de temporadas anteriores', action: 'query' },
      { id: 'back-main', label: '← Volver', action: 'submenu', category: 'main' }
    ]
  },
  recomendacion: {
    type: 'submenu',
    category: 'recomendacion',
    options: [
      { id: 'sugerir-precio', label: '💰 Sugerir precio óptimo', description: 'Calcular precio basado en similares', action: 'query' },
      { id: 'back-main', label: '← Volver', action: 'submenu', category: 'main' }
    ]
  }
};

// Opciones de navegación para respuestas finales
export const NAVIGATION_OPTIONS = [
  {
    id: 'menu-principal',
    label: '🏠 Volver al menú principal',
    description: 'Explorar otras opciones de análisis',
    emoji: '🏠',
    action: 'menu' as const,
    target: 'main'
  },
  {
    id: 'terminar',
    label: '✅ Terminar conversación',
    description: 'Finalizar la sesión de asistencia',
    emoji: '✅',
    action: 'end' as const
  }
];
