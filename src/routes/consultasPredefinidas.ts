import { Router } from 'express';
import { PREDEFINED_QUERIES } from '../queries/predefinedQueries.js';

const router = Router();

// Endpoint para obtener consultas predefinidas
router.get('/api/ai/consultas-predefinidas', (_req, res) => {
  const grouped = PREDEFINED_QUERIES.reduce((acc, query) => {
    if (!acc[query.category]) acc[query.category] = [];
    acc[query.category].push({
      id: query.id,
      label: query.label,
      fastPath: query.fastPath || false
    });
    return acc;
  }, {} as Record<string, any[]>);

  res.json({
    queries: grouped,
    total: PREDEFINED_QUERIES.length,
    categories: Object.keys(grouped)
  });
});

export default router;
