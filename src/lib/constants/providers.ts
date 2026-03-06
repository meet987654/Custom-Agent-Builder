export const VALID_MODELS: Record<string, string[]> = {
    groq: [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'llama3-groq-70b-8192-tool-use-preview',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
    ],
    gemini: [
        'gemini-2.0-flash-001',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash',
    ],
    openai: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-3.5-turbo',
    ],
    ollama: [
        'llama3.2',
        'llama3.1',
        'mistral',
        'phi3',
    ],
};

export const DEFAULT_MODEL: Record<string, string> = {
    groq: 'llama-3.3-70b-versatile',
    gemini: 'gemini-2.0-flash-001',
    openai: 'gpt-4o-mini',
    ollama: 'llama3.2',
};

export function resolveModel(provider: string, modelFromConfig: string | undefined): string {
    const effectiveModel = modelFromConfig || '';
    const valid = VALID_MODELS[provider];
    if (!valid) {
        console.warn(`[LLM] Unknown provider "${provider}" — cannot validate model, using as-is`);
        return effectiveModel;
    }
    if (valid.includes(effectiveModel)) {
        return effectiveModel;
    }
    const fallback = DEFAULT_MODEL[provider];
    console.warn(
        `[LLM] Model "${effectiveModel}" is not valid for provider "${provider}". ` +
        `Falling back to default: "${fallback}". ` +
        `Fix this in your agent config: change the model to one of: ${valid.join(', ')}`
    );
    return fallback;
}
