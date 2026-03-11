import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { config } from './config/env.js';
import { listaLimiterMiddleware } from './middleware/listaLimiter.js';
import healthRoutes from './routes/health.js';
import consultasPredefinidasRoutes from './routes/consultasPredefinidas.js';
import sugerenciasRoutes from './routes/sugerencias.js';
import chatRoutes from './routes/chat.js';

const app = express();

// Middlewares globales
app.use(cors());
app.use(compression({ threshold: config.compressThreshold }));
app.use(express.json({ limit: config.jsonLimit }));
app.use(listaLimiterMiddleware);

// Rutas
app.use(healthRoutes);
app.use(consultasPredefinidasRoutes);
app.use(sugerenciasRoutes);
app.use(chatRoutes);

// Iniciar servidor
app.listen(config.port, () => {
  console.log(`[ai-suggestions-server] listening on http://localhost:${config.port}`);
  console.log(`[ai] Provider: ${config.provider}`);
  console.log(`[ai] OpenAI enabled: ${Boolean(config.openaiApiKey)} | OLLAMA_MODEL: ${config.ollamaModel}`);
});
