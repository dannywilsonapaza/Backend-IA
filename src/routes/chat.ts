/**
 * Chat Route — Function Calling Agent
 *
 * Usa OpenAI function calling nativo: el modelo decide qué herramienta usar,
 * extrae parámetros del texto, ejecuta la API y genera la respuesta final.
 *
 * Reemplaza la heurística manual (selectTool) por un agente inteligente.
 * Archivo legacy: chat.legacy.ts (backup de la versión anterior).
 */
import { Router } from "express";
import crypto from "crypto";
import type { ChatRequest, ChatResponse, UiContext } from "../types/index.js";
import { isOpenAiProvider } from "../config/env.js";
import { runAgent } from "../ai/agentRunner.js";

const router = Router();

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeUiContext(value: unknown): UiContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as any;
  const screen = v.screen;
  if (!["cotizacion", "dashboard", "reportes", "general"].includes(screen))
    return undefined;
  return {
    screen,
    route: typeof v.route === "string" ? v.route : undefined,
    cotizacionId: v.cotizacionId ?? undefined,
    selectedCotizacionIds: Array.isArray(v.selectedCotizacionIds)
      ? v.selectedCotizacionIds
      : undefined,
  };
}

// ── Health check ───────────────────────────────────────────────
router.get("/api/chat/health", (_req, res) => {
  return res.json({
    module: "chat",
    status: "ok",
    mode: "function-calling",
    openaiEnabled: isOpenAiProvider(),
    timestamp: new Date().toISOString(),
  });
});

// ── Chat principal ─────────────────────────────────────────────
router.post("/api/chat", async (req, res) => {
  const body = (req.body || {}) as Partial<ChatRequest>;

  if (!isNonEmptyString(body.chatInput) || !isNonEmptyString(body.sessionId)) {
    return res.status(400).json({
      output: "Solicitud inválida: se requiere chatInput y sessionId.",
    } satisfies ChatResponse);
  }

  const uiContext = sanitizeUiContext(body.uiContext);
  const traceId = crypto.randomUUID();
  const chatInput = body.chatInput.trim();
  const sessionId = body.sessionId.trim();

  if (!isOpenAiProvider()) {
    return res.json({
      output:
        "El proveedor de IA no está configurado. Configura OPENAI_API_KEY y PROVIDER=openai.",
      traceId,
    } satisfies ChatResponse);
  }

  try {
    const result = await runAgent({ chatInput, sessionId, uiContext, traceId });

    return res.json({
      output: result.output,
      toolResult:
        result.toolResults.length > 0
          ? result.toolResults[result.toolResults.length - 1]
          : undefined,
      traceId,
      debug: body.options?.debug ? result.debug : undefined,
    } satisfies ChatResponse);
  } catch (error: any) {
    console.error("[chat] Agent error:", error?.message);
    return res.status(500).json({
      output: "Ocurrió un error procesando tu solicitud. Intenta nuevamente.",
      traceId,
    } satisfies ChatResponse);
  }
});

export default router;
