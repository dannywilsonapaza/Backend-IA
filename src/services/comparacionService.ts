/**
 * Servicio para consumir los endpoints de comparación del backend principal
 *
 * Endpoints del backend principal:
 * - GET /v1/comparacion/candidatos/:grupo/:cotizacionId - Listar candidatos por grupo
 * - GET /v1/comparacion/kpis/:cotizacionActual/:cotizacionAnterior - Comparar KPIs
 * - GET /v1/comparacion/minutajes/:cotizacionActual/:cotizacionAnterior - Comparar Minutajes
 */

import { config } from "../config/env.js";
import type {
  CandidatoComparacion,
  KPIsComparacion,
  ComparacionResult,
  CotizacionActualInfo,
  MinutajeComparacion,
  ComponenteComparacion,
} from "../types/index.js";

// Grupos válidos para comparación
export const GRUPOS_COMPARACION = {
  ESTILO_CLIENTE: "ESTILO_CLIENTE",
  ESTILO_NETTALCO: "ESTILO_NETTALCO",
  CLIENTE: "CLIENTE",
  GLOBAL: "GLOBAL",
} as const;

export type GrupoComparacion = keyof typeof GRUPOS_COMPARACION;

interface BackendResponse<T> {
  success: boolean;
  message?: string;
  warning?: string;
  data?: T;
}

interface CandidatosResponse {
  cotizacionActual: CotizacionActualInfo | null;
  candidatos: CandidatoComparacion[];
  grupo: string;
  total: number;
}

interface KPIsResponse {
  COT_ACTUAL_ID: number;
  TEMP_ACTUAL: string;
  COT_ANTERIOR_ID: number;
  TEMP_ANTERIOR: string;
  PRECIO_FOB_ACTUAL: number;
  PRECIO_FOB_ANTERIOR: number;
  PRECIO_FOB_DIFERENCIA: number;
  PRECIO_FOB_VARIACION_PCT: number | null;
  COSTO_POND_ACTUAL: number;
  COSTO_POND_ANTERIOR: number;
  COSTO_POND_DIFERENCIA: number;
  COSTO_POND_VARIACION_PCT: number | null;
  MARKUP_ACTUAL: number;
  MARKUP_ANTERIOR: number;
  MARKUP_DIFERENCIA: number;
  PRENDAS_ACTUAL: number;
  PRENDAS_ANTERIOR: number;
  PRENDAS_DIFERENCIA: number;
  PRENDAS_VARIACION_PCT: number | null;
}

/**
 * Obtener candidatos para comparación por grupo
 */
export async function obtenerCandidatos(
  cotizacionId: number,
  grupo: GrupoComparacion = "ESTILO_CLIENTE",
): Promise<ComparacionResult<CandidatosResponse>> {
  const url = `${config.backendPrincipalUrl}/api/v1/comparacion/candidatos/${grupo}/${cotizacionId}`;

  console.log("[comparacion][candidatos] Llamando a:", url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.backendPrincipalTimeout,
    );

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[comparacion][candidatos] Error HTTP:",
        response.status,
        errorText,
      );
      return {
        success: false,
        error: `Error del servidor: ${response.status}`,
        data: null,
      };
    }

    const result: BackendResponse<CandidatosResponse> = await response.json();

    console.log("[comparacion][candidatos] Respuesta:", {
      success: result.success,
      total: result.data?.total,
      grupo: result.data?.grupo,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.message || "Error al obtener candidatos",
        data: null,
      };
    }

    return {
      success: true,
      data: result.data || null,
      warning: result.warning,
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error("[comparacion][candidatos] Timeout");
      return {
        success: false,
        error: "Timeout al conectar con el backend principal",
        data: null,
      };
    }

    console.error("[comparacion][candidatos] Error:", error.message);
    return {
      success: false,
      error: `Error de conexión: ${error.message}`,
      data: null,
    };
  }
}

/**
 * Comparar KPIs entre dos cotizaciones
 */
export async function compararKPIs(
  cotizacionActual: number,
  cotizacionAnterior: number,
): Promise<ComparacionResult<KPIsComparacion>> {
  const url = `${config.backendPrincipalUrl}/api/v1/comparacion/kpis/${cotizacionActual}/${cotizacionAnterior}`;

  console.log("[comparacion][kpis] Llamando a:", url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.backendPrincipalTimeout,
    );

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[comparacion][kpis] Error HTTP:",
        response.status,
        errorText,
      );
      return {
        success: false,
        error: `Error del servidor: ${response.status}`,
        data: null,
      };
    }

    const result: BackendResponse<KPIsResponse> = await response.json();

    console.log("[comparacion][kpis] Respuesta:", {
      success: result.success,
      cotActual: result.data?.COT_ACTUAL_ID,
      cotAnterior: result.data?.COT_ANTERIOR_ID,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.message || "Error al comparar KPIs",
        data: null,
      };
    }

    // Normalizar respuesta a formato más amigable
    const kpis = result.data;
    if (!kpis) {
      return { success: false, error: "No se obtuvieron KPIs", data: null };
    }

    const normalized: KPIsComparacion = {
      cotizacionActual: {
        id: kpis.COT_ACTUAL_ID,
        temporada: kpis.TEMP_ACTUAL,
        precioFob: kpis.PRECIO_FOB_ACTUAL,
        costoPonderado: kpis.COSTO_POND_ACTUAL,
        markup: kpis.MARKUP_ACTUAL,
        prendasEstimadas: kpis.PRENDAS_ACTUAL,
      },
      cotizacionAnterior: {
        id: kpis.COT_ANTERIOR_ID,
        temporada: kpis.TEMP_ANTERIOR,
        precioFob: kpis.PRECIO_FOB_ANTERIOR,
        costoPonderado: kpis.COSTO_POND_ANTERIOR,
        markup: kpis.MARKUP_ANTERIOR,
        prendasEstimadas: kpis.PRENDAS_ANTERIOR,
      },
      diferencias: {
        precioFob: kpis.PRECIO_FOB_DIFERENCIA,
        precioFobPct: kpis.PRECIO_FOB_VARIACION_PCT,
        costoPonderado: kpis.COSTO_POND_DIFERENCIA,
        costoPonderadoPct: kpis.COSTO_POND_VARIACION_PCT,
        markup: kpis.MARKUP_DIFERENCIA,
        prendasEstimadas: kpis.PRENDAS_DIFERENCIA,
        prendasPct: kpis.PRENDAS_VARIACION_PCT,
      },
    };

    return {
      success: true,
      data: normalized,
      warning: result.warning,
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error("[comparacion][kpis] Timeout");
      return {
        success: false,
        error: "Timeout al conectar con el backend principal",
        data: null,
      };
    }

    console.error("[comparacion][kpis] Error:", error.message);
    return {
      success: false,
      error: `Error de conexión: ${error.message}`,
      data: null,
    };
  }
}

/**
 * Comparar Minutajes entre dos cotizaciones
 */
export async function compararMinutajes(
  cotizacionActual: number,
  cotizacionAnterior: number,
): Promise<ComparacionResult<MinutajeComparacion[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/comparacion/minutajes/${cotizacionActual}/${cotizacionAnterior}`;

  console.log("[comparacion][minutajes] Llamando a:", url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.backendPrincipalTimeout,
    );

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("[comparacion][minutajes] Error HTTP:", response.status);
      return { success: false, data: null };
    }

    const result: BackendResponse<MinutajeComparacion[]> =
      await response.json();
    return {
      success: true,
      data: result.data || [],
      warning: result.warning,
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error("[comparacion][minutajes] Timeout");
    } else {
      console.error("[comparacion][minutajes] Error:", error.message);
    }
    return { success: false, data: null };
  }
}

/**
 * Comparar Componentes entre dos cotizaciones
 */
export async function compararComponentes(
  cotizacionActual: number,
  cotizacionAnterior: number,
): Promise<ComparacionResult<ComponenteComparacion[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/comparacion/componentes/${cotizacionActual}/${cotizacionAnterior}`;

  console.log("[comparacion][componentes] Llamando a:", url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.backendPrincipalTimeout,
    );

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("[comparacion][componentes] Error HTTP:", response.status);
      return { success: false, data: null };
    }

    const result: BackendResponse<ComponenteComparacion[]> =
      await response.json();
    return {
      success: true,
      data: result.data || [],
      warning: result.warning,
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error("[comparacion][componentes] Timeout");
    } else {
      console.error("[comparacion][componentes] Error:", error.message);
    }
    return { success: false, data: null };
  }
}

/**
 * Seleccionar el mejor candidato de la lista
 * Criterios:
 * 1. Priorizar temporada más reciente
 * 2. Priorizar los que tienen precio_fob definido
 * 3. En caso de empate, el primero de la lista (ya viene ordenado del SP)
 */
export function seleccionarMejorCandidato(
  candidatos: CandidatoComparacion[],
): CandidatoComparacion | null {
  if (!candidatos || candidatos.length === 0) {
    return null;
  }

  // El procedimiento almacenado ya ordena por TCODITEMP DESC, TFECHCALC DESC
  // Solo filtramos los que tienen datos válidos
  const candidatosValidos = candidatos.filter(
    (c) => c.COTIZACION_ID && c.TEMPORADA,
  );

  if (candidatosValidos.length === 0) {
    return candidatos[0]; // Retornar el primero si ninguno cumple el filtro
  }

  // Priorizar los que tienen precio_fob > 0
  const conPrecio = candidatosValidos.filter(
    (c) => c.PRECIO_FOB && c.PRECIO_FOB > 0,
  );

  if (conPrecio.length > 0) {
    return conPrecio[0];
  }

  return candidatosValidos[0];
}

/**
 * Flujo completo de comparación:
 * 1. Obtener candidatos por grupo
 * 2. Seleccionar el mejor candidato
 * 3. Comparar KPIs con el seleccionado
 */
export async function ejecutarComparacionCompleta(
  cotizacionId: number,
  grupo: GrupoComparacion = "ESTILO_CLIENTE",
): Promise<{
  success: boolean;
  cotizacionActual: CotizacionActualInfo | null;
  candidatoSeleccionado: CandidatoComparacion | null;
  kpis: KPIsComparacion | null;
  minutajes: MinutajeComparacion[] | null;
  componentes: ComponenteComparacion[] | null;
  totalCandidatos: number;
  grupo: string;
  error?: string;
}> {
  // Paso 1: Obtener candidatos
  const candidatosResult = await obtenerCandidatos(cotizacionId, grupo);

  if (!candidatosResult.success || !candidatosResult.data) {
    return {
      success: false,
      cotizacionActual: null,
      candidatoSeleccionado: null,
      kpis: null,
      minutajes: null,
      componentes: null,
      totalCandidatos: 0,
      grupo,
      error: candidatosResult.error || "No se pudieron obtener candidatos",
    };
  }

  const { cotizacionActual, candidatos, total } = candidatosResult.data;

  if (candidatos.length === 0) {
    return {
      success: true,
      cotizacionActual,
      candidatoSeleccionado: null,
      kpis: null,
      minutajes: null,
      componentes: null,
      totalCandidatos: 0,
      grupo,
      error: `No se encontraron cotizaciones de temporadas anteriores en el grupo ${grupo}`,
    };
  }

  // Paso 2: Seleccionar el mejor candidato
  const mejorCandidato = seleccionarMejorCandidato(candidatos);

  if (!mejorCandidato) {
    return {
      success: true,
      cotizacionActual,
      candidatoSeleccionado: null,
      kpis: null,
      minutajes: null,
      componentes: null,
      totalCandidatos: total,
      grupo,
      error: "No se pudo seleccionar un candidato válido",
    };
  }

  console.log("[comparacion] Candidato seleccionado:", {
    id: mejorCandidato.COTIZACION_ID,
    temporada: mejorCandidato.TEMPORADA,
    precioFob: mejorCandidato.PRECIO_FOB,
  });

  // Paso 3: Comparar KPIs, Minutajes y Componentes (Paralelo)
  const [kpisResult, minutajesResult, componentesResult] = await Promise.all([
    compararKPIs(cotizacionId, mejorCandidato.COTIZACION_ID),
    compararMinutajes(cotizacionId, mejorCandidato.COTIZACION_ID),
    compararComponentes(cotizacionId, mejorCandidato.COTIZACION_ID),
  ]);

  if (!kpisResult.success) {
    // Aún así retornamos el candidato seleccionado
    return {
      success: true,
      cotizacionActual,
      candidatoSeleccionado: mejorCandidato,
      kpis: null,
      minutajes: null,
      componentes: null,
      totalCandidatos: total,
      grupo,
      error: kpisResult.error,
    };
  }

  return {
    success: true,
    cotizacionActual,
    candidatoSeleccionado: mejorCandidato,
    kpis: kpisResult.data,
    minutajes: minutajesResult.success ? minutajesResult.data : [],
    componentes: componentesResult.success ? componentesResult.data : [],
    totalCandidatos: total,
    grupo,
  };
}
