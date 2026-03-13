import express from "express";
import cors from "cors";
import compression from "compression";
import { config } from "./config/env.js";
import healthRoutes from "./routes/health.js";
import chatRoutes from "./routes/chat.js";

const app = express();

// Middlewares globales
app.use(cors());
app.use(compression({ threshold: config.compressThreshold }));
app.use(express.json({ limit: config.jsonLimit }));

// Rutas
app.use(healthRoutes);
app.use(chatRoutes);

// Iniciar servidor
app.listen(config.port, () => {
  const aiMode =
    process.env.AI_MODE === "fc"
      ? "Function Calling + o3"
      : "Assistants API + gpt-4o";
  console.log(
    `[ai-suggestions-server] listening on http://localhost:${config.port}`,
  );
  console.log(`[ai] Modo: ${aiMode}`);
  console.log(`[ai] Provider: ${config.provider}`);
  console.log(
    `[ai] OpenAI enabled: ${Boolean(config.openaiApiKey)} | OLLAMA_MODEL: ${config.ollamaModel}`,
  );
});
