import OpenAI from "openai";
import { config } from "../../config/env.js";

// ── Tipos re-exportados para el agente ─────────────────────────
export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;
export type ChatTool = OpenAI.Chat.ChatCompletionTool;
export type ChatCompletion = OpenAI.Chat.ChatCompletion;

export interface OpenAIResponse {
  text: string;
  model: string;
  id: string;
  usage: any;
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

export async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<OpenAIResponse> {
  const openai = getClient();

  const isReasoningModel = /^o\d/i.test(config.openaiModel);

  const response = await openai.chat.completions.create({
    model: config.openaiModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    ...(isReasoningModel
      ? { max_completion_tokens: maxTokens }
      : {
          temperature: 0.2,
          max_tokens: maxTokens,
          presence_penalty: 0,
          frequency_penalty: 0,
        }),
  });

  return {
    text: response.choices?.[0]?.message?.content?.trim() || "",
    model: (response as any).model,
    id: (response as any).id,
    usage: (response as any).usage || null,
  };
}

// ── Function Calling: llamada con herramientas ─────────────────
export async function createChatCompletion(
  messages: ChatMessage[],
  tools?: ChatTool[],
  maxTokens = 2000,
): Promise<ChatCompletion> {
  const openai = getClient();
  const isReasoningModel = /^o\d/i.test(config.openaiModel);

  return openai.chat.completions.create({
    model: config.openaiModel,
    messages,
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(isReasoningModel
      ? { max_completion_tokens: maxTokens }
      : { temperature: 0.2, max_tokens: maxTokens }),
  });
}
