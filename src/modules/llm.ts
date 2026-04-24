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
    const modelId = 'google/gemma-4-26b-a4b-it';

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const completion = await openRouter.chat.send({
        chatRequest: {
            model: modelId,
            messages,
            stream: false,
        },
    });

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
