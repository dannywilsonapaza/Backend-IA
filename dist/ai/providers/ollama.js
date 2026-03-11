import { config } from '../../config/env.js';
export async function callOllama(systemPrompt, userPrompt, numPredict) {
    const controller = new AbortController();
    const timeoutMs = config.ollamaTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(config.ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.ollamaModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                options: {
                    temperature: 0.2,
                    num_predict: numPredict,
                    top_p: 0.9
                },
                stream: false,
            }),
            signal: controller.signal,
        });
        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`ollama_http_${response.status}: ${txt.slice(0, 200)}`);
        }
        const data = await response.json();
        return {
            text: data?.message?.content?.toString().trim() || '',
            model: data?.model || config.ollamaModel,
        };
    }
    catch (err) {
        if (err?.name === 'AbortError') {
            throw new Error(`ollama_timeout_${timeoutMs}ms`);
        }
        throw err;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
