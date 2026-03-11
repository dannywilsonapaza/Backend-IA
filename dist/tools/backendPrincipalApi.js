import { config } from '../config/env.js';
import { fetchJson } from './http.js';
export async function getDetalleCotizacion(cotizacionId, trace) {
    const url = `${config.backendPrincipalUrl}/api/v1/cotizar/gestion/detalle/${cotizacionId}`;
    const { data } = await fetchJson(url, { trace, traceName: 'cotizar.gestion.detalle' });
    return data;
}
export async function getColoresCotizacion(cotizacionId, trace) {
    const url = `${config.backendPrincipalUrl}/api/v1/cotizar/colores/cotizacion/${cotizacionId}`;
    const { data } = await fetchJson(url, { trace, traceName: 'cotizar.colores.cotizacion' });
    return data;
}
export async function getComponentesCotizacion(cotizacionId, trace) {
    const url = `${config.backendPrincipalUrl}/api/v1/cotizar/componentes/cotizacion/${cotizacionId}`;
    const { data } = await fetchJson(url, { trace, traceName: 'cotizar.componentes.cotizacion' });
    return data;
}
