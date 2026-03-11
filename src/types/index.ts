// Tipos e interfaces del sistema de sugerencias IA

export interface CachedListaEntry {
  rows: any[];
  ts: number;
}

export interface PredefinedQuery {
  id: string;
  label: string;
  category: 'datos' | 'comparacion' | 'recomendacion';
  fastPath?: boolean;
  template: string;
  grupo?: string; // Para queries de comparación con grupos
}

export type IntentType =
  | 'greeting'           // Saludos simples
  | 'precio-sugerencia'  // "cual es el mejor precio", "que precio poner"
  | 'comparacion'        // "compara con similares", "cómo está vs otros"
  | 'explicacion'        // "por qué este costo", "explica el markup"
  | 'recomendacion'      // "qué me sugieres", "cómo optimizar"
  | 'dato-simple'        // "precio", "costo" (fast-path)
  | 'consulta-general';  // Cualquier otra pregunta

export type ConversationState = 'greeting' | 'menu-request' | 'query';

export type MenuType = 'main' | 'datos' | 'comparacion' | 'recomendacion';

// Grupos de comparación disponibles
export type GrupoComparacion = 'ESTILO_CLIENTE' | 'CLIENTE' | 'GLOBAL';

export interface MenuOption {
  id: string;
  label: string;
  description?: string;
  action: 'submenu' | 'query';
  category?: string;
  emoji?: string;
  target?: string;
}

export interface Menu {
  type: 'main' | 'submenu';
  category?: string;
  greeting?: string;
  options: MenuOption[];
}

export interface ConversationalMenus {
  main: Menu;
  datos: Menu;
  comparacion: Menu;
  recomendacion: Menu;
}

export interface SimilarCotizacion {
  id: number;
  codigoCliente: string;
  temporada: string;
  costoPonderado: number;
  precioCotizacion: number;
  markup?: number;
}

// Tipos para el servicio de comparación con el backend principal
export interface CotizacionActualInfo {
  COTIZACION_ID: number;
  TEMPORADA: string;
  ESTILO_CLIENTE: string;
  ESTILO_NETTALCO: string;
  NOMBRE_CLIENTE: string;
  FECHA_CREACION: string;
  ESTADO: string;
}

export interface CandidatoComparacion {
  COTIZACION_ID: number;
  TEMPORADA: string;
  ESTILO_CLIENTE: string;
  ESTILO_NETTALCO: string;
  NOMBRE_CLIENTE: string;
  FECHA_CALCULO: string | null;
  FECHA_CREACION: string;
  ESTADO: string;
  PRECIO_FOB: number | null;
  GRUPO: string;
}

export interface KPIsComparacion {
  cotizacionActual: {
    id: number;
    temporada: string;
    precioFob: number;
    costoPonderado: number;
    markup: number;
    prendasEstimadas: number;
  };
  cotizacionAnterior: {
    id: number;
    temporada: string;
    precioFob: number;
    costoPonderado: number;
    markup: number;
    prendasEstimadas: number;
  };
  diferencias: {
    precioFob: number;
    precioFobPct: number | null;
    costoPonderado: number;
    costoPonderadoPct: number | null;
    markup: number;
    prendasEstimadas: number;
    prendasPct: number | null;
  };
}

// Interfaces para Minutajes y Componentes (Nuevos endpoints)
export interface MinutajeComparacion {
  COT_ACTUAL_ID: number;
  COT_ANTERIOR_ID: number;
  CODIGO_ACTIVIDAD: string;
  DESCRIPCION_ACTIVIDAD: string;
  TIPO_EFICIENCIA: string;
  DESC_TIPO_EFICIENCIA: string;
  MINUTAJE_ACTUAL: number;
  MINUTAJE_ANTERIOR: number;
  MINUTAJE_DIFERENCIA: number;
  MINUTAJE_VARIACION_PCT: number;
  EFICIENCIA_ACTUAL: number;
  EFICIENCIA_ANTERIOR: number;
  EFICIENCIA_DIFERENCIA: number;
}

export interface ComponenteComparacion {
  COT_ACTUAL_ID: number;
  COT_ANTERIOR_ID: number;
  TTIPOITEM: string;
  TNUMEITEM: string;
  TDESCITEM: string;
  TTIPOCOMP: string;
  TDESCTIPOCOMP: string;
  TNUMECOMP: string;
  TDESCCOMP: string;
  TFAMIAVIO: string;
  CONSUMO_ACTUAL: number | null;
  CONSUMO_ANTERIOR: number | null;
  CONSUMO_DIFERENCIA: number;
  ESTADO: string;
}

export interface ComparacionResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
  warning?: string;
}

export interface NormalizedCotizacion {
  TCODICOTI: any;
  TCODIESTICLIE: any;
  TCODIESTINETT: any;
  TNUMEVERSESTINETT: any;
  TABRVCLIE: any;
  TDESCDIVICLIE: any;
  TDESCDIVICLIEABRV: any;
  TDESCPREN: any;
  TCOMPPRIN: any;
  TCODITELA: any;
  TDESCTELA: any;
  TCODITEMP: any;
  TTIPOCOTI: any;
  TDESCTIPOCOTI: any;
  TESTACOTI: any;
  TDESCESTACOTI: any;
  TCOSTPOND: number;
  TPRECCOTI: number;
  TPRECCOTIMELA: any;
  MARKUP: any;
  TMKUPOBJE: any;
  TPRENESTI: any;
  TPRENDAS12: number;
  TPESOESTMPREN: any;
  TCANTPRENPROY: any;
  TPORCGASTCOMIAGEN: any;
  TFECHCREA: any;
  TFECHMODI: any;
  TANIOBASE: any;
  TMES_BASE: any;
}

export interface MenuSelectionResult {
  type: 'menu' | 'query' | 'error' | 'end';
  data?: {
    menuType?: string;
    queryId?: string;
    message?: string;
  };
}

export interface AIResponse {
  reply: string;
  similares: SimilarCotizacion[];
  confidence: number;
  provider: string;
  model?: string;
  openaiId?: string;
  usage?: any;
  dataSource: string;
  listaHash: string | null;
  cacheStatus: string;
  isMenu?: boolean;
  menuOptions?: MenuOption[];
  menuTitle?: string;
  showBackButton?: boolean;
  menuType?: string;
  queryId?: string;
  conversationEnded?: boolean;
  error?: string;
  mode?: string;
  similaresCompactos?: any[];
}

// ==========================
// Contrato Chat (N8N + Tools)
// ==========================

export type ChatScreen = 'cotizacion' | 'dashboard' | 'reportes' | 'general';

export interface UiContext {
  screen: ChatScreen;
  route?: string;
  cotizacionId?: number | string | null;
  selectedCotizacionIds?: Array<number | string>;
}

export type ToolArtifactType = 'summary' | 'table' | 'diff' | 'kpi' | 'facts' | 'warning';

export interface ToolArtifact {
  type: ToolArtifactType;
  title: string;
  data: any;
}

export interface ToolResult {
  intent: string;
  entities: Record<string, any>;
  artifacts: ToolArtifact[];
  limits?: {
    truncated?: boolean;
    reason?: string;
  };
  apiTrace?: Array<{
    name: string;
    url?: string;
    ms?: number;
    status?: number;
  }>;
}

export interface ChatRequest {
  chatInput: string;
  sessionId: string;
  uiContext?: UiContext;
  options?: {
    debug?: boolean;
  };
}

export interface ChatResponse {
  output: string;
  toolResult?: ToolResult;
  traceId?: string;
  debug?: any;
}
