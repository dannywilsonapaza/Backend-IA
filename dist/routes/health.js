import { Router } from 'express';
import { config, isOpenAiEnabled } from '../config/env.js';
const router = Router();
// Health check básico
router.get('/health', (_req, res) => {
    res.json({ ok: true });
});
// Estado del proveedor de IA
router.get('/health/ai', (_req, res) => {
    const model = config.provider === 'ollama' ? config.ollamaModel : config.openaiModel;
    res.json({
        openAi: isOpenAiEnabled(),
        provider: config.provider,
        model
    });
});
export default router;
