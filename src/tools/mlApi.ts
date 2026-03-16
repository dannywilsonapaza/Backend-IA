import { config } from "../config/env.js";
import { fetchJson } from "./http.js";
import type { ApiTraceItem } from "./http.js";

export interface MlPredictRequest {
  TCOSTPOND: number;
  TPESOESTMPREN: number;
  TPORCGASTCOMIAGEN: number;
  TCANTPRENPROY_log: number;
  TMKUPOBJE: number;
  TPORCMAQUCHICTENI: number;
  TPORCMAQUMEDITENI: number;
  TPORCMAQUGRANTENI: number;
  ANIO: number;
  titulo_hilo: number;
  flag_lycra: number;
  flag_msuave: number;
  flag_gwash: number;
  flag_antip: number;
  TABRVCLIE: string;
  SEMESTRE: string;
  TPROCESPEPREN: string;
  TDESCTIPOTELA: string;
  tipo_tejido: string;
  fibra: string;
}

export interface MlPredictResponse {
  precio_fob_predicho: number;
  modelo: string;
  confianza: string;
}

export async function predictPrecioFob(
  body: MlPredictRequest,
  trace: ApiTraceItem[],
): Promise<{ success: boolean; data?: MlPredictResponse; message?: string }> {
  try {
    const url = `${config.mlApiUrl}/predict`;
    const { status, data } = await fetchJson<MlPredictResponse>(url, {
      method: "POST",
      body,
      timeoutMs: config.mlApiTimeout,
      trace,
      traceName: "ml.predict",
    });

    if (status >= 400) {
      return {
        success: false,
        message: `ML API respondió con status ${status}`,
      };
    }

    return { success: true, data };
  } catch (err: any) {
    return {
      success: false,
      message: err.message ?? "Error al conectar con ML API",
    };
  }
}
