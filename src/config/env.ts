import "dotenv/config";

export const config = {
  // Servidor
  port: Number(process.env.PORT) || 5055,
  jsonLimit: process.env.JSON_LIMIT || "2mb",
  compressThreshold: Number(process.env.COMPRESS_THRESHOLD || 1024),

  // Proveedor de IA
  provider:
    (process.env.PROVIDER || "").toLowerCase() ||
    (process.env.OPENAI_API_KEY ? "openai" : "mock"),

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: "gpt-4o",

  // Ollama
  ollamaModel: process.env.OLLAMA_MODEL || "llama3.1:8b",
  ollamaUrl: "http://localhost:11434/api/chat",
  ollamaTimeout: Number(process.env.OLLAMA_TIMEOUT || 8000),

  // Backend Principal (API de Comparación)
  backendPrincipalUrl:
    process.env.BACKEND_PRINCIPAL_URL || "http://localhost:3920",
  backendPrincipalTimeout: Number(
    process.env.BACKEND_PRINCIPAL_TIMEOUT || 10000,
  ),

  // n8n (redacción conversacional)
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL || "",
  n8nTimeout: Number(process.env.N8N_TIMEOUT || 15000),

  // Upstream API (legacy)
  upstreamBaseUrl: process.env.UPSTREAM_BASE_URL || "",
  upstreamToken: process.env.UPSTREAM_TOKEN || "",

  // Cache y límites
  maxListaCots: Number(process.env.MAX_LISTA_COTS || 400),
  maxListaCacheEntries: Number(process.env.MAX_LISTA_CACHE_ENTRIES || 50),
} as const;

export const isOpenAiEnabled = () => Boolean(config.openaiApiKey);
export const isOllamaProvider = () => config.provider === "ollama";
export const isOpenAiProvider = () =>
  config.provider === "openai" && isOpenAiEnabled();
