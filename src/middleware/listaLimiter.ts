import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';

// Middleware para limitar y proyectar listaCotizaciones
export function listaLimiterMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (req.method === 'POST' && req.path === '/api/ai/cotizaciones/sugerencias' && req.body && Array.isArray(req.body.listaCotizaciones)) {
      const maxItems = config.maxListaCots;

      // Proyectar a campos mínimos para reducir peso
      const projectFields = (r: any) => ({
        TCODICOTI: r.TCODICOTI,
        TCODIESTICLIE: r.TCODIESTICLIE,
        TCODITEMP: r.TCODITEMP,
        TPRECCOTI: r.TPRECCOTI,
        TCOSTPOND: r.TCOSTPOND,
        TMKUPOBJE: r.TMKUPOBJE,
        MARKUP: r.MARKUP
      });

      if (req.body.listaCotizaciones.length > maxItems) {
        req.body.listaCotizaciones = req.body.listaCotizaciones.slice(0, maxItems).map(projectFields);
      } else {
        req.body.listaCotizaciones = req.body.listaCotizaciones.map(projectFields);
      }
    }
  } catch (_) {
    // Ignorar errores silenciosamente
  }
  next();
}
