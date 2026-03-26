import { config } from "../config/env.js";
import { fetchJson } from "./http.js";
import type { ApiTraceItem } from "./http.js";

interface BackendResponse<T> {
  success: boolean;
  message?: string;
  warning?: string;
  data?: T;
}

export async function getDetalleCotizacion(
  cotizacionId: number,
  trace: ApiTraceItem[],
): Promise<BackendResponse<any>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/gestion/detalle/${cotizacionId}`;
  const { data } = await fetchJson<BackendResponse<any>>(url, {
    trace,
    traceName: "cotizar.gestion.detalle",
  });
  return data;
}

export async function getColoresCotizacion(
  cotizacionId: number,
  trace: ApiTraceItem[],
): Promise<BackendResponse<any[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/colores/cotizacion/${cotizacionId}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.colores.cotizacion",
  });
  return data;
}

export async function getComponentesCotizacion(
  cotizacionId: number,
  trace: ApiTraceItem[],
): Promise<BackendResponse<any[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/componentes/cotizacion/${cotizacionId}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.componentes.cotizacion",
  });
  return data;
}

export async function getDescriptoresEstiloNettalco(
  tcodiestinett: string,
  trace: ApiTraceItem[],
): Promise<BackendResponse<any[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/descriptores/estiloNettalco/${encodeURIComponent(tcodiestinett)}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.descriptores.estiloNettalco",
  });
  return data;
}

export async function getDimensionesEstiloNettalco(
  tcodiestinett: string,
  trace: ApiTraceItem[],
): Promise<BackendResponse<any>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/dimensiones/estiloNettalco/${encodeURIComponent(tcodiestinett)}`;
  const { data } = await fetchJson<BackendResponse<any>>(url, {
    trace,
    traceName: "cotizar.dimensiones.estiloNettalco",
  });
  return data;
}

export async function getExtrasCotizacion(
  cotizacionId: number,
  trace: ApiTraceItem[],
): Promise<BackendResponse<any[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/extras/cotizacion/${cotizacionId}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.extras.cotizacion",
  });
  return data;
}

export async function getExtrasRubros(
  trace: ApiTraceItem[],
  tcodirubr?: string,
): Promise<BackendResponse<any[]>> {
  const q = tcodirubr ? `?tcodirubr=${encodeURIComponent(tcodirubr)}` : "";
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/extras/rubros${q}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.extras.rubros",
  });
  return data;
}

export async function getHiladosPorColorCotizacion(
  cotizacionId: number,
  trace: ApiTraceItem[],
): Promise<BackendResponse<any[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/hilados-color/cotizacion/${cotizacionId}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.hiladosColor.cotizacion",
  });
  return data;
}

export async function getHiladosPorColorItems(
  trace: ApiTraceItem[],
  numeItem?: string,
): Promise<BackendResponse<any[]>> {
  const q = numeItem ? `?numeItem=${encodeURIComponent(numeItem)}` : "";
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/hilados-color/items${q}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.hiladosColor.items",
  });
  return data;
}

export async function getHiladosPorColorColores(
  trace: ApiTraceItem[],
  numeColor?: string,
): Promise<BackendResponse<any[]>> {
  const q = numeColor ? `?numeColor=${encodeURIComponent(numeColor)}` : "";
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/hilados-color/colores${q}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.hiladosColor.colores",
  });
  return data;
}

export async function getHiladosEspecialesCotizacion(
  cotizacionId: number,
  trace: ApiTraceItem[],
): Promise<BackendResponse<any[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/hilados-especiales/cotizacion/${cotizacionId}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.hiladosEspeciales.cotizacion",
  });
  return data;
}

export async function getHiladosEspecialesItems(
  trace: ApiTraceItem[],
  numeItem?: string,
): Promise<BackendResponse<any[]>> {
  const q = numeItem ? `?numeItem=${encodeURIComponent(numeItem)}` : "";
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/hilados-especiales/items${q}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.hiladosEspeciales.items",
  });
  return data;
}

export async function getMinutajesCotizacion(
  cotizacionId: number,
  trace: ApiTraceItem[],
): Promise<BackendResponse<any[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/minutajes/cotizacion/${cotizacionId}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.minutajes.cotizacion",
  });
  return data;
}

export async function getMinutajesCodigos(
  trace: ApiTraceItem[],
  tcodiacti?: string,
): Promise<BackendResponse<any[]>> {
  const q = tcodiacti ? `?tcodiacti=${encodeURIComponent(tcodiacti)}` : "";
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/minutajes/codigos${q}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.minutajes.codigos",
  });
  return data;
}

export async function getListaMinutajesCliente(
  tcodiesticlie: string,
  trace: ApiTraceItem[],
): Promise<BackendResponse<any[]>> {
  const url = `${config.backendPrincipalUrl}/api/v1/cotizar/minutajes/cliente/${encodeURIComponent(tcodiesticlie)}`;
  const { data } = await fetchJson<BackendResponse<any[]>>(url, {
    trace,
    traceName: "cotizar.minutajes.cliente",
  });
  return data;
}
