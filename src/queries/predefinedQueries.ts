import type { PredefinedQuery } from '../types/index.js';

export const PREDEFINED_QUERIES: PredefinedQuery[] = [
  // Fast-path (sin LLM) - respuesta instantánea
  { id: 'resumen-general', label: 'Resumen general', category: 'datos', fastPath: true, template: 'resumen' },
  { id: 'precio-actual', label: 'Ver precio actual', category: 'datos', fastPath: true, template: 'precio' },
  { id: 'costo-actual', label: 'Ver costo ponderado', category: 'datos', fastPath: true, template: 'costo' },
  { id: 'markup-actual', label: 'Ver markup actual', category: 'datos', fastPath: true, template: 'markup' },
  { id: 'info-cliente', label: 'Información del cliente', category: 'datos', fastPath: true, template: 'cliente' },
  { id: 'detalles-especificos', label: 'Detalles específicos', category: 'datos', fastPath: true, template: 'detalles' },

  // Comparaciones con grupos (llama al backend principal)
  { id: 'comparar-estilo-cliente', label: 'Por estilo cliente', category: 'comparacion', template: 'comparar con temporadas anteriores del mismo estilo cliente', grupo: 'ESTILO_CLIENTE' },
  { id: 'comparar-cliente', label: 'Por cliente', category: 'comparacion', template: 'comparar con temporadas anteriores del mismo cliente', grupo: 'CLIENTE' },
  { id: 'comparar-global', label: 'Global', category: 'comparacion', template: 'comparar con todas las cotizaciones de temporadas anteriores', grupo: 'GLOBAL' },

  // Recomendación única (LLM)
  { id: 'sugerir-precio', label: 'Sugerir precio óptimo', category: 'recomendacion', template: 'sugerir precio óptimo basado en cotizaciones similares' }
];

// IDs de consultas del submenú datos (para fast-path forzado)
export const DATOS_QUERY_IDS = new Set([
  'resumen-general',
  'precio-actual',
  'costo-actual',
  'markup-actual',
  'info-cliente',
  'detalles-especificos'
]);

// IDs de consultas de comparación (llaman al backend principal)
export const COMPARACION_QUERY_IDS = new Set([
  'comparar-estilo-cliente',
  'comparar-cliente',
  'comparar-global'
]);

// Mapeo de query ID a grupo de comparación
export const QUERY_TO_GRUPO: Record<string, string> = {
  'comparar-estilo-cliente': 'ESTILO_CLIENTE',
  'comparar-cliente': 'CLIENTE',
  'comparar-global': 'GLOBAL'
};

// Mapeo de alias de mensajes a IDs de consultas
export const DATOS_ALIAS_MAP: Record<string, string> = {
  // Resumen general
  'resumen general': 'resumen-general',
  'resumen-general': 'resumen-general',
  'resumen': 'resumen-general',
  'ver resumen': 'resumen-general',
  'dame resumen': 'resumen-general',
  'mostrar resumen': 'resumen-general',

  // Precio actual
  'ver precio actual': 'precio-actual',
  'precio actual': 'precio-actual',
  'precio-actual': 'precio-actual',
  'precio': 'precio-actual',
  'ver precio': 'precio-actual',
  'dame precio': 'precio-actual',
  'mostrar precio': 'precio-actual',
  'cual es el precio': 'precio-actual',
  'cuanto es el precio': 'precio-actual',
  'precio cotizacion': 'precio-actual',
  'precio de cotizacion': 'precio-actual',

  // Costo ponderado
  'ver costo ponderado': 'costo-actual',
  'costo ponderado': 'costo-actual',
  'costo-actual': 'costo-actual',
  'costo': 'costo-actual',
  'ver costo': 'costo-actual',
  'ver costo actual': 'costo-actual',
  'costo actual': 'costo-actual',
  'dame costo': 'costo-actual',
  'mostrar costo': 'costo-actual',
  'cual es el costo': 'costo-actual',
  'cuanto es el costo': 'costo-actual',

  // Markup actual
  'ver markup actual': 'markup-actual',
  'markup actual': 'markup-actual',
  'markup-actual': 'markup-actual',
  'markup': 'markup-actual',
  'ver markup': 'markup-actual',
  'dame markup': 'markup-actual',
  'mostrar markup': 'markup-actual',
  'cual es el markup': 'markup-actual',
  'margen': 'markup-actual',
  'ver margen': 'markup-actual',

  // Información del cliente
  'información del cliente': 'info-cliente',
  'informacion del cliente': 'info-cliente',
  'info cliente': 'info-cliente',
  'info-cliente': 'info-cliente',
  'cliente': 'info-cliente',
  'ver cliente': 'info-cliente',
  'datos cliente': 'info-cliente',
  'datos del cliente': 'info-cliente',
  'quien es el cliente': 'info-cliente',

  // Detalles específicos
  'detalles específicos': 'detalles-especificos',
  'detalles especificos': 'detalles-especificos',
  'detalles-especificos': 'detalles-especificos',
  'detalles': 'detalles-especificos',
  'ver detalles': 'detalles-especificos',
  'dame detalles': 'detalles-especificos',
  'mostrar detalles': 'detalles-especificos',
  'detalle': 'detalles-especificos',
  'ver detalle': 'detalles-especificos',
  'info': 'detalles-especificos',
  'informacion': 'detalles-especificos',
  'información': 'detalles-especificos',

  // Comparaciones por grupo
  'comparar estilo cliente': 'comparar-estilo-cliente',
  'comparar-estilo-cliente': 'comparar-estilo-cliente',
  'estilo cliente': 'comparar-estilo-cliente',
  'por estilo cliente': 'comparar-estilo-cliente',
  'mismo estilo': 'comparar-estilo-cliente',

  'comparar cliente': 'comparar-cliente',
  'comparar-cliente': 'comparar-cliente',
  'por cliente': 'comparar-cliente',
  'mismo cliente': 'comparar-cliente',

  'comparar global': 'comparar-global',
  'comparar-global': 'comparar-global',
  'global': 'comparar-global',
  'todas las cotizaciones': 'comparar-global',
  'comparar todas': 'comparar-global'
};

export function getQueryById(id: string): PredefinedQuery | undefined {
  return PREDEFINED_QUERIES.find(q => q.id === id);
}

export function resolveQueryAlias(mensaje: string): string | null {
  const msgLower = mensaje.trim().toLowerCase();
  return DATOS_ALIAS_MAP[msgLower] || null;
}
