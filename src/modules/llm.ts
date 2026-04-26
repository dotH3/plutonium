import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

const pricingCache = new Map<string, { prompt: number; completion: number }>();

async function getModelPricing(modelId: string) {
    if (pricingCache.has(modelId)) {
        return pricingCache.get(modelId)!;
    }

    const modelsList = await openRouter.models.list();
    const model = modelsList.data.find((m) => m.id === modelId);
    if (!model) {
        throw new Error(`Model ${modelId} not found in OpenRouter models list`);
    }

    const prompt = parseFloat(model.pricing.prompt) || 0;
    const completion = parseFloat(model.pricing.completion) || 0;
    const pricing = { prompt, completion };
    pricingCache.set(modelId, pricing);
    return pricing;
}

export const queryLLM = async (userPrompt: string, systemPrompt?: string) => {
    // const modelId = 'google/gemma-4-26b-a4b-it';
    const modelId = 'google/gemini-2.5-flash'
    const startTime = performance.now();
    console.log(`[queryLLM] Launching query...`);

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const payloadSize = new Blob([JSON.stringify(messages)]).size;
    const payloadKB = (payloadSize / 1024).toFixed(2);
    console.log(`[queryLLM] Request size: ${payloadKB} KB`);

    const completion = await openRouter.chat.send({
        chatRequest: {
            model: modelId,
            messages,
            stream: false,
        },
    });
    const elapsed = (performance.now() - startTime) / 1000;
    console.log(`[queryLLM] Response received in ${elapsed.toFixed(2)}s`);

    const pricing = await getModelPricing(modelId);
    const promptTokens = completion.usage?.promptTokens ?? 0;
    const completionTokens = completion.usage?.completionTokens ?? 0;
    const costRaw = (promptTokens * pricing.prompt) + (completionTokens * pricing.completion);
    const cost = costRaw.toLocaleString("en-US", { maximumFractionDigits: 10 });

    return {
        completion,
        cost,
    };
};
