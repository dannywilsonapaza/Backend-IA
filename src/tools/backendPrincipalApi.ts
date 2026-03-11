import { config } from '../config/env.js';
import { fetchJson } from './http.js';
import type { ApiTraceItem } from './http.js';

interface BackendResponse<T> {
  success: boolean;
  message?: string;
  warning?: string;
  data?: T;
}

export async function getDetalleCotizacion(
  cotizacionId: number,
  trace: ApiTraceItem[]
): Promise<BackendResponse<any>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/gestion/detalle/${cotizacionId}`;
  const { data } = await fetchJson<BackendResponse<any>>(url, { trace, traceName: 'cotizar.gestion.detalle' });
  return data;
}

export async function getColoresCotizacion(
  cotizacionId: number,
  trace: ApiTraceItem[]
): Promise<BackendResponse<any[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/colores/cotizacion/${cotizacionId}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, { trace, traceName: 'cotizar.colores.cotizacion' });
  return data;
}

export async function getComponentesCotizacion(
  cotizacionId: number,
  trace: ApiTraceItem[]
): Promise<BackendResponse<any[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/componentes/cotizacion/${cotizacionId}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, { trace, traceName: 'cotizar.componentes.cotizacion' });
  return data;
}
