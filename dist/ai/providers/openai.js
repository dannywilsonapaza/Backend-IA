import OpenAI from 'openai';
import { config } from '../../config/env.js';
let client = null;
function getClient() {
    if (!client) {
        client = new OpenAI({ apiKey: config.openaiApiKey });
    }
    return client;
}
export async function callOpenAI(systemPrompt, userPrompt, maxTokens) {
    const openai = getClient();
    const response = await openai.chat.completions.create({
        model: config.openaiModel,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
        presence_penalty: 0,
        frequency_penalty: 0
    });
    return {
        text: response.choices?.[0]?.message?.content?.trim() || '',
        model: response.model,
        id: response.id,
        usage: response.usage || null,
    };
}
