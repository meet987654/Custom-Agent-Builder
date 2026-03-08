"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MODEL = exports.VALID_MODELS = void 0;
exports.resolveModel = resolveModel;
exports.VALID_MODELS = {
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
exports.DEFAULT_MODEL = {
    groq: 'llama-3.3-70b-versatile',
    gemini: 'gemini-1.5-flash',
    openai: 'gpt-4o-mini',
    ollama: 'llama3.2',
};
function resolveModel(provider, modelFromConfig) {
    var effectiveModel = modelFromConfig || '';
    var valid = exports.VALID_MODELS[provider];
    if (!valid) {
        console.warn("[LLM] Unknown provider \"".concat(provider, "\" \u2014 cannot validate model, using as-is"));
        return effectiveModel;
    }
    if (valid.includes(effectiveModel)) {
        return effectiveModel;
    }
    var fallback = exports.DEFAULT_MODEL[provider];
    console.warn("[LLM] Model \"".concat(effectiveModel, "\" is not valid for provider \"").concat(provider, "\". ") +
        "Falling back to default: \"".concat(fallback, "\". ") +
        "Fix this in your agent config: change the model to one of: ".concat(valid.join(', ')));
    return fallback;
}
