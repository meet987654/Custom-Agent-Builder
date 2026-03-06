import { cli, defineAgent, JobContext, WorkerOptions, stt, llm, tts, voice } from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as openaiPlugin from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as googlePlugin from '@livekit/agents-plugin-google';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { decrypt } from '../src/lib/encryption';
import { InputValidator } from './input-validator';
import { VALID_MODELS, DEFAULT_MODEL, resolveModel } from '../src/lib/constants/providers';

// ─── Environment ─────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env.local');
dotenv.config({ path: envPath });
console.log(`[WORKER] Loading env from ${envPath}`);

process.on('unhandledRejection', (reason: any) => {
    console.error('[WORKER] Unhandled rejection caught at process level:', reason?.message ?? reason);
    // Do NOT exit — let the worker recover
});

if (!process.env.LIVEKIT_URL) {
    process.env.LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials missing for worker');
}
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentConfig {
    language: string;
    voice_gender?: string;
    goodbye_triggers?: string[];
    stt: { provider: string; model: string; options?: any };
    llm: { provider: string; model: string; options?: any };
    tts: { provider: string; model: string; voice: string; speed?: string };
    vad: {
        provider: string;
        threshold: number;
        barge_in: boolean;
        silence_timeout_ms: number;
        min_speech_duration_ms?: number;
        min_silence_duration_ms?: number;
        speech_pad_ms?: number;
        barge_in_min_duration_ms?: number;
        noise_cancellation?: boolean;
        first_response_timeout_secs?: number;
    };
    system_prompt: string;
    workflow_steps: WorkflowStep[];
    tools: any[];
    silence_behavior: { messages?: string[] };
    key_overrides?: { [key: string]: string | undefined };
}

interface WorkflowStep {
    id?: string;
    order?: number;
    type?: string;
    question?: string;
    prompt?: string;
    label?: string;
    required?: boolean;
}

// ─── Session State ────────────────────────────────────────────────────────────

interface SessionState {
    // Lifecycle
    greeting_delivered: boolean;
    conversation_started: boolean;
    agent_busy: boolean;
    goodbye_delivered: boolean;
    sessionClosed: boolean;

    // Workflow
    current_step_index: number;
    workflow_complete: boolean;

    // Silence tracking
    last_was_silence_message: boolean;
    silence_count: number;
    last_user_utterance_time: number;
    last_agent_speech_end: number;

    // Anti-hallucination
    last_valid_response_time: number;
    empty_response_count: number;
    last_transcript: string;
    same_transcript_count: number;
    transcript_debounce_timer: ReturnType<typeof setTimeout> | null;
}

function makeState(): SessionState {
    return {
        greeting_delivered: false,
        conversation_started: false,
        agent_busy: false,
        goodbye_delivered: false,
        sessionClosed: false,
        current_step_index: 0,
        workflow_complete: false,
        last_was_silence_message: false,
        silence_count: 0,
        last_user_utterance_time: 0,
        last_agent_speech_end: 0,
        last_valid_response_time: Date.now(),
        empty_response_count: 0,
        last_transcript: '',
        same_transcript_count: 0,
        transcript_debounce_timer: null,
    };
}

// ─── VAD Defaults ─────────────────────────────────────────────────────────────
const VAD_DEFAULTS = {
    threshold: 0.5,
    minSpeechDurationMs: 300,
    minSilenceDurationMs: 1000,
    speechPadMs: 300,
    bargeInMinDurationMs: 300,
};

// ─── STT Defaults ─────────────────────────────────────────────────────────────
const STT_DEFAULTS = {
    endpointing: 800,
    smartFormat: true,
    punctuate: true,
    noDelay: false,
};

// ─── Input Validation Defaults ────────────────────────────────────────────────
const INPUT_VALIDATION_DEFAULTS = {
    minWordCount: 2,
    minDurationMs: 1500,
    confidenceThreshold: 0.75,
    escalationThreshold: 3,
    maxConsecutiveInvalid: 5,
};

// ─── Anti-Hallucination Constants ─────────────────────────────────────────────
const MAX_EMPTY_RESPONSES = 3;
const MIN_VALID_RESPONSE_LENGTH = 5;

// ─── API Key Resolution ───────────────────────────────────────────────────────

async function resolveApiKey(provider: string, agentRecord: any): Promise<string | null> {
    const providerKeyName = `${provider.toUpperCase()}_API_KEY`;
    console.log(`[KEY] Resolving key for provider: "${provider}", user_id: "${agentRecord.user_id}"`);

    if (agentRecord.config.key_overrides?.[provider]) {
        console.log(`[KEY] ✅ Using config override for ${provider}`);
        return agentRecord.config.key_overrides[provider];
    }
    console.log(`[KEY] No config override for ${provider}.`);

    try {
        const { data: userKey, error: keyError } = await supabase
            .from('api_keys')
            .select('key_encrypted, is_active')
            .eq('user_id', agentRecord.user_id)
            .eq('provider', provider)
            .eq('is_active', true)
            .maybeSingle();

        if (keyError) {
            console.error(`[KEY] ❌ Supabase query error for ${provider}:`, keyError.message);
        } else if (userKey?.key_encrypted) {
            try {
                const decrypted = decrypt(userKey.key_encrypted);
                console.log(`[KEY] ✅ Using Supabase-stored key for ${provider} (${decrypted.slice(0, 4)}***)`);
                return decrypted;
            } catch (e: any) {
                console.error(`[KEY] ❌ Failed to decrypt key for provider ${provider}:`, e?.message ?? e);
            }
        } else {
            console.warn(`[KEY] ⚠️  No active key in Supabase api_keys table for provider="${provider}", user="${agentRecord.user_id}".`);
            console.warn(`[KEY]    Make sure the key was saved from the agent edit page and matches this exact provider name.`);
        }
    } catch (e: any) {
        console.error(`[KEY] ❌ Unexpected error querying api_keys for ${provider}:`, e?.message ?? e);
    }

    const envKey = process.env[providerKeyName];
    if (envKey) {
        console.log(`[KEY] ⚠️  Using .env fallback for ${provider} (${providerKeyName}). Website key was NOT found.`);
        return envKey;
    }

    console.warn(`[KEY] ❌ No API key found for provider: ${provider} — checked config overrides, Supabase, and .env`);
    return null;
}

// ─── Transcript Save ──────────────────────────────────────────────────────────

async function saveTranscript(data: any) {
    try {
        const response = await fetch(`${appUrl}/api/transcripts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            console.error('[TRANSCRIPT] Failed to save:', await response.text());
        } else {
            console.log('[TRANSCRIPT] Saved successfully.');
        }
    } catch (err) {
        console.error('[TRANSCRIPT] Error saving:', err);
    }
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

function buildGenderRules(lang: string, gender: string): string | null {
    if (lang === 'hi' || lang === 'hindi') {
        if (gender === 'female') {
            return `LANGUAGE AND GENDER RULES — HINDI:
You are a female assistant. In all Hindi responses, use feminine grammatical forms.

Verb conjugations — use feminine forms:
- Use करूंगी (not करूंगा)
- Use बताऊंगी (not बताऊंगा)
- Use समझूंगी (not समझूंगा)
- Use कर सकती हूं (not कर सकता हूं)

Self-reference: Always use मैं with feminine verb endings.
Adjectives referring to yourself: Use आपकी सहायक हूं (not आपका सहायक).
Speak naturally in Hindi. Keep responses short — 1 to 2 sentences.`;
        } else if (gender === 'male') {
            return `LANGUAGE AND GENDER RULES — HINDI:\nYou are a male assistant. Use masculine Hindi grammar throughout.`;
        }
    } else if (lang === 'gu' || lang === 'gujarati') {
        if (gender === 'female') {
            return `LANGUAGE AND GENDER RULES — GUJARATI:\nYou are a female assistant. Use feminine Gujarati grammatical forms.`;
        }
    }
    return null;
}

function buildSystemPrompt(config: AgentConfig): string {
    let prompt = config.system_prompt || 'You are a helpful voice assistant.';
    const gender = config.voice_gender || 'neutral';
    const lang = config.language || config.stt?.options?.language || 'en';

    if (lang === 'hi' || lang === 'hindi' || lang === 'gu' || lang === 'gujarati') {
        if (gender !== 'neutral') {
            const rulesBlock = buildGenderRules(lang, gender);
            if (rulesBlock) prompt += '\n\n' + rulesBlock;
        }
    } else if ((lang === 'en' || lang === 'english') && gender === 'female') {
        prompt += '\n\nYou are a female assistant. Refer to yourself using she/her pronouns if asked.';
    }

    const steps = config.workflow_steps;
    if (Array.isArray(steps) && steps.length > 0) {
        const stepLines = steps.map((s, i) => {
            const text = s.question || s.prompt || s.label || JSON.stringify(s);
            return `Step ${i + 1}: ${text}`;
        }).join('\n');

        prompt += `

═══════════════════════════════════════════════════════════
CONVERSATION WORKFLOW — FOLLOW THIS EXACTLY, IN ORDER
═══════════════════════════════════════════════════════════

You are conducting a structured conversation. YOU drive it — do not wait for the user to lead.

${stepLines}

WORKFLOW RULES:
1. After your greeting, immediately ask Step 1. Do NOT wait for the user to ask you anything first.
2. Complete every step IN ORDER. Never skip a step. Never jump ahead.
3. Ask ONE question per turn — the question for the current step only.
4. When the user answers, acknowledge in 1 sentence, then immediately ask the next step's question.
5. If the user's answer is unclear, re-ask the SAME step. Do NOT advance until you have a clear answer.
6. When ALL steps are complete, provide a brief 1-sentence summary, say goodbye, then stop. Do NOT ask "Is there anything else?".
7. Only close the call after every single step has a confirmed answer.`;
    }

    prompt += `

═══════════════════════════════════════════════════════════
CRITICAL RESPONSE RULES — ALWAYS APPLY
═══════════════════════════════════════════════════════════

1. NEVER generate an empty, whitespace-only, or single-character response. Every reply must be a complete, meaningful sentence.
2. NEVER repeat your previous response verbatim. If you must repeat, rephrase.
3. If the user is silent, repeat the CURRENT step's question prefixed with "Are you still there?". Do NOT advance.
4. Keep responses short — maximum 2 sentences per turn. No bullet points, no markdown.
5. If the user says something off-topic, acknowledge in 1 sentence then re-ask the current step's question.
6. NEVER make up information the user did not provide.
7. NEVER ask multiple questions in a single turn.
8. After your farewell sentence, say nothing more. The call ends.`;

    return prompt;
}

// ─── Silence Handler ──────────────────────────────────────────────────────────

class SilenceHandler {
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    private timeoutMs: number;
    private readonly onTimeout: () => Promise<void>;

    constructor(timeoutMs: number, onTimeout: () => Promise<void>) {
        this.timeoutMs = timeoutMs;
        this.onTimeout = onTimeout;
    }

    setTimeoutDuration(ms: number) { this.timeoutMs = ms; }

    startWaiting() {
        this.clearTimer();
        this.running = true;
        this.timer = setTimeout(async () => {
            if (!this.running) return;
            await this.onTimeout();
        }, this.timeoutMs);
        console.debug(`[SILENCE] Timer armed — ${this.timeoutMs}ms.`);
    }

    stop() {
        this.clearTimer();
        this.running = false;
        console.debug('[SILENCE] Timer stopped.');
    }

    resetAndStart(state: SessionState) {
        state.silence_count = 0;
        state.last_was_silence_message = false;
        this.startWaiting();
        console.debug('[SILENCE] Count reset → 0. Fresh window.');
    }

    private clearTimer() {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    }
}

// ─── Response Validator ───────────────────────────────────────────────────────

function isValidResponse(text: string | undefined | null): boolean {
    if (!text) return false;
    return text.replace(/[\n\r\s\t]/g, '').length >= MIN_VALID_RESPONSE_LENGTH;
}

// ─── Main Agent Entry ─────────────────────────────────────────────────────────

let globalVadInstance: any = null;

export default defineAgent({
    prewarm: async (proc: any) => {
        console.log('[AGENT] Pre-warming Silero VAD...');
        try {
            globalVadInstance = await silero.VAD.load();
            console.log('[AGENT] ✅ VAD pre-warmed successfully.');
        } catch (e) {
            console.error('[AGENT] ⚠️  VAD pre-warm failed — will load per-session:', e);
        }
    },
    entry: async (ctx: JobContext) => {
        await ctx.connect();
        console.log(`[AGENT] Connected to room: ${ctx.room.name}`);

        const startTime = Date.now();
        const sessionId = ctx.room.name;

        let metadata: any = {};
        try {
            metadata = JSON.parse(ctx.room.metadata || '{}');
        } catch (e) {
            console.error('[AGENT] Failed to parse room metadata:', ctx.room.metadata);
        }

        const agentId = metadata.agent_id;
        const userId = metadata.user_id;

        if (!agentId) {
            console.error('[AGENT] No agent_id in room metadata. Exiting.');
            return;
        }

        console.log(`[AGENT] Loading config for agent ID: ${agentId}`);
        const { data: agentRecord, error: agentError } = await supabase
            .from('agents').select('*').eq('id', agentId).single();

        if (agentError || !agentRecord) {
            console.error(`[AGENT] Agent ${agentId} not found:`, agentError);
            return;
        }

        const config = agentRecord.config as AgentConfig;
        console.log(`[AGENT] Config loaded. STT: ${config.stt?.provider}, LLM: ${config.llm?.provider}, TTS: ${config.tts?.provider}`);

        const sttKey = await resolveApiKey(config.stt.provider, agentRecord);
        const llmKey = await resolveApiKey(config.llm.provider, agentRecord);
        const ttsKey = await resolveApiKey(config.tts.provider, agentRecord);

        const vadThreshold = config.vad?.threshold ?? VAD_DEFAULTS.threshold;
        const vadMinSpeechMs = config.vad?.min_speech_duration_ms ?? VAD_DEFAULTS.minSpeechDurationMs;
        const vadMinSilenceMs = config.vad?.min_silence_duration_ms ?? VAD_DEFAULTS.minSilenceDurationMs;
        const vadSpeechPadMs = config.vad?.speech_pad_ms ?? VAD_DEFAULTS.speechPadMs;
        const bargeInMinMs = config.vad?.barge_in_min_duration_ms ?? VAD_DEFAULTS.bargeInMinDurationMs;

        console.log(`[VAD] threshold=${vadThreshold}, minSpeech=${vadMinSpeechMs}ms, minSilence=${vadMinSilenceMs}ms, pad=${vadSpeechPadMs}ms`);

        // ── Build STT ─────────────────────────────────────────────────────
        let sttInstance: stt.STT | undefined;
        if (config.stt.provider === 'deepgram' && sttKey) {
            sttInstance = new deepgram.STT({
                apiKey: sttKey,
                model: config.stt.model as any,
                endpointing: config.stt.options?.endpointing ?? STT_DEFAULTS.endpointing,
                smartFormat: config.stt.options?.smart_format ?? STT_DEFAULTS.smartFormat,
                punctuate: config.stt.options?.punctuate ?? STT_DEFAULTS.punctuate,
                noDelay: config.stt.options?.no_delay ?? STT_DEFAULTS.noDelay,
                language: config.language || 'en',
            } as any);
        }

        // ── Build LLM ─────────────────────────────────────────────────────
        let llmInstance: llm.LLM;
        const provider = config.llm.provider;
        const resolvedModel = resolveModel(provider, config.llm.model);
        const temperature = config.llm.options?.temperature ?? 0.7;
        const maxTokens = config.llm.options?.max_tokens ?? 256;

        console.log(`[LLM] Provider: ${provider}, Model: ${resolvedModel}`);

        if (provider === 'groq') {
            llmInstance = new openaiPlugin.LLM({
                model: resolvedModel as any, apiKey: llmKey || undefined,
                baseURL: 'https://api.groq.com/openai/v1',
                temperature, maxCompletionTokens: maxTokens,
            });
        } else if (provider === 'gemini' || provider === 'google') {
            llmInstance = new googlePlugin.LLM({
                model: resolvedModel as any, apiKey: llmKey || undefined,
                temperature, maxOutputTokens: maxTokens,
            });
        } else if (provider === 'openai') {
            llmInstance = new openaiPlugin.LLM({
                model: resolvedModel as any, apiKey: llmKey || undefined,
                temperature, maxCompletionTokens: maxTokens,
            });
        } else if (provider === 'ollama') {
            llmInstance = new openaiPlugin.LLM({
                model: resolvedModel as any, apiKey: 'ollama',
                baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
                temperature, maxCompletionTokens: maxTokens,
            });
        } else if (provider === 'xai') {
            llmInstance = new openaiPlugin.LLM({
                model: resolvedModel as any, apiKey: llmKey || undefined,
                baseURL: 'https://api.x.ai/v1',
                temperature, maxCompletionTokens: maxTokens,
            });
        } else {
            throw new Error(`[LLM] Unknown provider: "${provider}". Supported: groq, gemini, google, openai, ollama, xai.`);
        }

        // ── Build TTS ─────────────────────────────────────────────────────
        let ttsInstance: tts.TTS | undefined;
        if (config.tts.provider === 'cartesia' && ttsKey) {
            let cartesiaVoice = config.tts.voice || '794f9389-aac1-45b6-b726-9d9369183238';
            if (cartesiaVoice && cartesiaVoice.length !== 36) {
                console.warn(`[TTS] Cartesia voice "${cartesiaVoice}" is invalid format. Falling back to default.`);
                cartesiaVoice = '794f9389-aac1-45b6-b726-9d9369183238';
            }
            let cartesiaModel = config.tts.model && config.tts.model !== 'sonic-2' ? config.tts.model : 'sonic-english';
            console.log(`[TTS] Cartesia voice: ${cartesiaVoice}, model: ${cartesiaModel}`);
            ttsInstance = new cartesia.TTS({ apiKey: ttsKey, voice: cartesiaVoice, model: cartesiaModel as any });
        } else if (config.tts.provider === 'openai' && ttsKey) {
            const openaiVoice = config.tts.voice || 'alloy';
            console.log(`[TTS] OpenAI voice: ${openaiVoice}`);
            ttsInstance = new openaiPlugin.TTS({ apiKey: ttsKey, voice: openaiVoice as any });
        } else if (config.tts.provider === 'elevenlabs' && ttsKey) {
            const elVoice = config.tts.voice || '21m00Tcm4TlvDq8ikWAM';
            // Sanitize model — Cartesia model names (sonic-*, sonic2, etc.) must not be
            // passed to ElevenLabs. Valid ElevenLabs models start with "eleven_".
            const rawModel = config.tts.model || '';
            const elModel = rawModel.startsWith('eleven_')
                ? rawModel
                : 'eleven_turbo_v2_5';  // fastest, lowest latency
            console.log(`[TTS] ElevenLabs voiceId: ${elVoice}, model: ${elModel}${rawModel !== elModel ? ` (sanitized from "${rawModel}")` : ''}`);
            ttsInstance = new elevenlabs.TTS({
                apiKey: ttsKey,
                voiceId: elVoice as string,
                model: elModel as any,
            });
        }

        if (!sttInstance || !llmInstance || !ttsInstance) {
            console.error('[AGENT] ❌ Missing components:');
            console.error(`  STT (${config.stt.provider}): ${sttInstance ? '✅' : '❌ MISSING KEY'}`);
            console.error(`  LLM (${config.llm.provider}): ${llmInstance ? '✅' : '❌ MISSING KEY'}`);
            console.error(`  TTS (${config.tts.provider}): ${ttsInstance ? '✅' : '❌ MISSING KEY'}`);
            return;
        }

        try {
            console.log('[AGENT] Verifying LLM connectivity...');
            const chatCtx = new llm.ChatContext([
                llm.ChatMessage.create({ role: 'user', content: 'hello' }),
            ]);
            const testStream = await llmInstance.chat({ chatCtx });
            for await (const _chunk of testStream) { break; }
            console.log('[AGENT] ✅ LLM connection verified');
        } catch (e) {
            console.error('[AGENT] ❌ LLM Connection Failed:', e);
        }

        const state = makeState();

        const vadLoadOptions = {
            minSilenceDuration: vadMinSilenceMs / 1000,
            minSpeechDuration: vadMinSpeechMs / 1000,
            preSpeechPadDuration: vadSpeechPadMs / 1000,
            positiveSpeechThreshold: vadThreshold,
            negativeSpeechThreshold: Math.max(vadThreshold - 0.05, 0.45),
            frameDuration: 0.128,
            sampleRate: 16000,
        };

        let vadInstance: any;
        if (globalVadInstance) {
            vadInstance = globalVadInstance;
            try {
                if (typeof vadInstance.updateOptions === 'function') {
                    vadInstance.updateOptions(vadLoadOptions);
                    console.log('[VAD] Using pre-warmed VAD instance with updated options.');
                } else {
                    vadInstance = await silero.VAD.load(vadLoadOptions as any);
                    console.log('[VAD] Pre-warmed instance lacks updateOptions — loaded fresh.');
                }
            } catch (e) {
                console.warn('[VAD] updateOptions failed — loading fresh VAD:', e);
                vadInstance = await silero.VAD.load(vadLoadOptions as any);
            }
        } else {
            vadInstance = await silero.VAD.load(vadLoadOptions as any);
            console.log('[VAD] Loaded fresh VAD instance (no pre-warm available).');
        }

        console.warn(
            '[VAD] Silero on CPU (128 ms frames). ' +
            'If "inference slower than realtime" persists >500ms, consider GPU acceleration.'
        );

        const validator = new InputValidator(INPUT_VALIDATION_DEFAULTS);

        const voiceAgent = new voice.Agent({ instructions: buildSystemPrompt(config) });

        const session = new voice.AgentSession({
            vad: vadInstance,
            stt: sttInstance,
            llm: llmInstance,
            tts: ttsInstance,
            turnDetection: 'stt',
            voiceOptions: {
                minEndpointingDelay: 0.6,
                maxEndpointingDelay: 3.0,
                minInterruptionDuration: bargeInMinMs / 1000,
                allowInterruptions: config.vad?.barge_in ?? true,
                userAwayTimeout: 999999,
            },
        });

        // ── Workflow helpers ──────────────────────────────────────────────

        const workflowSteps = Array.isArray(config.workflow_steps) ? config.workflow_steps : [];
        const totalSteps = workflowSteps.length;

        function getCurrentStepText(): string | null {
            if (state.current_step_index >= totalSteps) return null;
            const s = workflowSteps[state.current_step_index];
            return s?.question || s?.prompt || s?.label || null;
        }

        function advanceStep() {
            state.current_step_index++;
            if (state.current_step_index >= totalSteps) {
                state.workflow_complete = true;
                console.log('[WORKFLOW] All steps complete.');
            } else {
                console.log(`[WORKFLOW] Advanced to step ${state.current_step_index + 1}/${totalSteps}.`);
            }
        }

        function injectStepInstruction() {
            if (totalSteps === 0) return;

            let instruction: string;
            if (state.workflow_complete) {
                instruction = `All ${totalSteps} workflow steps are now complete. Provide a brief 1-sentence summary of the answers collected, say a natural goodbye, and do not say anything after the farewell.`;
            } else {
                const stepText = getCurrentStepText();
                const stepNum = state.current_step_index + 1;
                if (!stepText) return;
                instruction = `You are now on Step ${stepNum} of ${totalSteps}. Ask this question and only this question: "${stepText}". Do not ask anything else. Do not advance to the next step yet.`;
            }

            try {
                const chatCtx = (session as any).chatCtx
                    ?? (session as any)._chatCtx
                    ?? (session as any).chat_ctx;
                if (chatCtx?.messages) {
                    chatCtx.messages.push(
                        llm.ChatMessage.create({ role: 'system', content: instruction })
                    );
                    console.log(`[WORKFLOW] Step instruction injected: "${instruction.slice(0, 100)}"`);
                } else {
                    console.warn('[WORKFLOW] chatCtx not accessible — step instruction not injected.');
                }
            } catch (e) {
                console.warn('[WORKFLOW] Could not inject step instruction:', e);
            }
        }

        // ── Goodbye handler ───────────────────────────────────────────────

        const handleGoodbye = async (instant = false) => {
            if (state.sessionClosed) return;
            state.sessionClosed = true;
            state.goodbye_delivered = true;
            silenceHandler.stop();

            if (!instant) {
                const goodbyeMsg = config.silence_behavior?.messages?.[2]
                    ?? 'Thank you for your time. Have a great day!';
                try {
                    await session.say(goodbyeMsg, { allowInterruptions: false });
                } catch (e) { console.error('[GOODBYE] say error:', e); }

                await new Promise(r => setTimeout(r, 2000));
            } else {
                console.log('[AGENT] Instant disconnect triggered.');
            }

            await saveTranscript({
                agent_id: agentId,
                user_id: userId,
                session_id: sessionId,
                duration_seconds: Math.floor((Date.now() - startTime) / 1000),
                transcript_json: [],
                metadata: { avg_latency: 0 },
            });
            try { await ctx.room.disconnect(); } catch (_) { }
        };

        // ── Silence timeout handler ───────────────────────────────────────

        const onSilenceTimeout = async () => {
            if (state.sessionClosed) return;
            if (!state.greeting_delivered) return;
            if (state.agent_busy) return;
            if (state.goodbye_delivered) return;

            state.silence_count += 1;
            console.log(`[SILENCE] User silent. Count: ${state.silence_count}`);

            const silenceMessages: string[] = config.silence_behavior?.messages || [
                'Are you still there? Take your time.',
                "I'll wait just a moment longer.",
                'Thank you for your time. Have a great day!',
            ];

            if (state.silence_count === 1) {
                const stepText = getCurrentStepText();
                const msg = stepText
                    ? `Are you still there? Just to confirm — ${stepText}`
                    : (silenceMessages[0] ?? 'Are you still there? Take your time.');

                state.last_was_silence_message = true;
                try {
                    await session.say(msg, { allowInterruptions: true });
                } catch (e) { console.error('[SILENCE] stage-1 say error:', e); }

            } else if (state.silence_count === 2) {
                state.last_was_silence_message = true;
                try {
                    await session.say(
                        silenceMessages[1] ?? "I'll wait just a moment longer.",
                        { allowInterruptions: true }
                    );
                } catch (e) { console.error('[SILENCE] stage-2 say error:', e); }

            } else {
                state.goodbye_delivered = true;
                silenceHandler.stop();
                try {
                    await session.say(
                        silenceMessages[2] ?? 'Thank you for your time. Have a great day!',
                        { allowInterruptions: false }
                    );
                } catch (e) { console.error('[SILENCE] stage-3 say error:', e); }
            }
        };

        const firstTimeoutMs = config.vad?.first_response_timeout_secs
            ? config.vad.first_response_timeout_secs * 1000
            : 20_000;

        const silenceHandler = new SilenceHandler(firstTimeoutMs, onSilenceTimeout);

        // ─────────────────────────────────────────────────────────────────
        // Session Event Listeners
        // ─────────────────────────────────────────────────────────────────

        // agentBusyStartTime tracks when the agent last entered busy (speaking/thinking).
        // ROLLING WINDOW FIX: When a stale VAD frame is filtered, we reset this to
        // Date.now() so the NEXT frame is also checked relative to NOW. This keeps
        // the guard alive for the full duration of the VAD backlog drain (2-3s on
        // slow CPUs). Without rolling, the 150ms guard expires in 150ms, letting
        // backlogged frames through just as ElevenLabs is delivering its first audio
        // frame (TTFB 500-800ms), causing a silent "speaking" state.
        // Cartesia wasn't affected because its TTFB (~100ms) beats the 150ms guard.
        let agentBusyStartTime = Date.now();

        // Gap between stale frames in the backlog is <50ms per logs.
        // 150ms catches each stale frame before rolling to the next.
        // Real barge-in requires ≥300ms sustained speech, so this is safe.
        const STALE_VAD_GUARD_MS = 150;

        session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
            const busy = event.newState === 'speaking' || event.newState === 'thinking';
            state.agent_busy = busy;

            if (event.newState === 'speaking') {
                agentBusyStartTime = Date.now();
                silenceHandler.stop();
                console.debug('[SILENCE] Stopped — agent is speaking.');
            } else if (event.newState === 'thinking') {
                agentBusyStartTime = Date.now();
                silenceHandler.stop();
                console.debug('[SILENCE] Stopped — agent is thinking.');
            } else if (event.newState === 'listening') {
                console.debug('[AGENT] Agent state → listening.');
            }
        });

        session.on(voice.AgentSessionEventTypes.UserStateChanged, (event: any) => {
            if (event.newState === 'speaking') {
                const msSinceAgentBusy = Date.now() - agentBusyStartTime;

                if (state.agent_busy && msSinceAgentBusy < STALE_VAD_GUARD_MS) {
                    // ROLLING: push the window forward so the next backlogged frame
                    // is also checked relative to NOW, not to when speaking started.
                    agentBusyStartTime = Date.now();
                    console.debug(`[VAD] Stale frame filtered (rolling) — ${msSinceAgentBusy}ms gap.`);
                    return;
                }

                silenceHandler.stop();
                console.debug(`[BARGE-IN] User speaking — ${msSinceAgentBusy}ms after agent went busy.`);
            }
        });

        session.on(voice.AgentSessionEventTypes.SpeechCreated, (event) => {
            event.speechHandle.addDoneCallback(async (sh: any) => {
                if (state.sessionClosed) return;

                state.agent_busy = false;
                state.last_agent_speech_end = Date.now();

                const wasInterrupted = Boolean(sh?.interrupted);

                if (state.goodbye_delivered) {
                    setTimeout(async () => {
                        if (state.sessionClosed) return;
                        console.log('[AGENT] Goodbye delivered. Disconnecting.');
                        await saveTranscript({
                            agent_id: agentId,
                            user_id: userId,
                            session_id: sessionId,
                            duration_seconds: Math.floor((Date.now() - startTime) / 1000),
                            transcript_json: [],
                            metadata: { avg_latency: 0 },
                        });
                        try { await ctx.room.disconnect(); } catch (_e) { }
                    }, 2000);
                    return;
                }

                const chatItems = Array.isArray(sh?.chatItems) ? sh.chatItems : [];
                const messageContent = chatItems
                    .map((c: any) => c.content ?? c.text ?? '')
                    .join('');

                const wasEmpty = !isValidResponse(messageContent);

                if (wasInterrupted) {
                    if (wasEmpty) {
                        console.debug('[BARGE-IN] Agent interrupted before speaking. SDK processing user utterance.');
                    } else {
                        console.debug(`[BARGE-IN] Agent interrupted mid-speech: "${messageContent.slice(0, 60)}". SDK re-running LLM.`);
                        state.empty_response_count = 0;
                    }
                    return;
                }

                if (wasEmpty) {
                    state.empty_response_count++;
                    console.warn(
                        `[ANTI-HALLUCINATION] Empty response #${state.empty_response_count}. ` +
                        `Content: "${messageContent?.slice(0, 60)}"`
                    );
                    if (state.empty_response_count >= MAX_EMPTY_RESPONSES) {
                        console.error('[ANTI-HALLUCINATION] Max empties reached. Injecting recovery.');
                        state.empty_response_count = 0;
                        try {
                            await session.say(
                                "I'm sorry, I seem to be having trouble. Could you please repeat that?",
                                { allowInterruptions: true }
                            );
                        } catch (e) { console.error('[ANTI-HALLUCINATION] Recovery say failed:', e); }
                    }
                    if (state.silence_count < 3) { silenceHandler.startWaiting(); }
                    return;
                }

                state.empty_response_count = 0;
                state.last_valid_response_time = Date.now();

                if (totalSteps > 0 && !state.workflow_complete && !state.last_was_silence_message) {
                    advanceStep();
                    injectStepInstruction();
                }

                if (state.last_was_silence_message) {
                    state.last_was_silence_message = false;
                    console.debug('[SILENCE] Silence msg delivered. Restarting (count preserved).');
                    silenceHandler.startWaiting();
                } else {
                    console.debug('[SILENCE] Agent response done. Resetting count, arming timer.');
                    silenceHandler.resetAndStart(state);
                }
            });
        });

        session.on(voice.AgentSessionEventTypes.Close, () => {
            console.log('[AGENT] Session closed. Setting sessionClosed guard.');
            state.sessionClosed = true;
            silenceHandler.stop();
        });

        (session as any).on('error', (error: any) => {
            const errMsg = error?.message ?? error?.context?.error?.message ?? '';
            console.error('[SESSION] Error:', error?.context?.type, error?.context?.error?.name, errMsg);
            if (error?.context?.type === 'llm_error') {
                console.error('[LLM] Provider may be misconfigured or unreachable.');
            }
            if (errMsg.includes('402') || errMsg.includes('Payment Required') || errMsg.includes('Unexpected server response: 402')) {
                console.error('[TTS] ❌ CRITICAL: TTS provider returned 402 (Payment Required). Your API credits may be exhausted.');
                console.error('[TTS] The agent CANNOT speak without working TTS. Please top up your TTS provider credits.');
            }
        });

        (session as any).on('llm_error', async (error: any) => {
            console.error('[AGENT] ❌ LLM error:', error.message);
            if (error.recoverable) {
                try {
                    await session.say("I'm having a little trouble. Give me just a moment.", { allowInterruptions: true });
                } catch (_e) { }
            } else {
                console.error('[AGENT] 🛑 CRITICAL: Unrecoverable LLM error.');
                try {
                    await session.say(
                        "I'm sorry, I'm experiencing a technical issue and need to end our call. Please try again shortly.",
                        { allowInterruptions: false }
                    );
                } catch (_e) { }
                setTimeout(() => ctx.room.disconnect().catch(() => { }), 5000);
            }
        });

        // ─────────────────────────────────────────────────────────────────
        // User Input Transcription Handler
        // ─────────────────────────────────────────────────────────────────

        const TRANSCRIPT_DEBOUNCE_MS = 10;
        let accumulatedTranscript = '';

        session.on(voice.AgentSessionEventTypes.UserInputTranscribed, async (event) => {
            if (!(event as any).isFinal) return;
            if (state.sessionClosed) return;

            const segment: string = (event as any).transcript ?? '';
            if (!segment.trim()) return;

            if (segment.length > accumulatedTranscript.length) {
                accumulatedTranscript = segment;
            }

            console.log(`[TRANSCRIPT] Segment: "${segment.slice(0, 100)}"`);

            if (state.transcript_debounce_timer) {
                clearTimeout(state.transcript_debounce_timer);
                state.transcript_debounce_timer = null;
            }

            state.transcript_debounce_timer = setTimeout(async () => {
                state.transcript_debounce_timer = null;
                if (state.sessionClosed) return;

                const fullTranscript = accumulatedTranscript;
                accumulatedTranscript = '';

                state.last_user_utterance_time = Date.now();

                console.log(`[TURN] User: "${fullTranscript.slice(0, 120)}"`);

                if (fullTranscript === state.last_transcript) {
                    state.same_transcript_count++;
                    if (state.same_transcript_count >= 3) {
                        console.warn(`[ANTI-HALLUCINATION] Repeated ×${state.same_transcript_count}: "${fullTranscript.slice(0, 60)}".`);
                        return;
                    }
                } else {
                    state.same_transcript_count = 0;
                    state.last_transcript = fullTranscript;
                }

                if (!state.conversation_started) {
                    state.conversation_started = true;
                    console.log('[AGENT] Conversation started.');
                    silenceHandler.setTimeoutDuration(Math.max(config.vad?.silence_timeout_ms || 8000, 5000));
                }

                const goodbyeTriggers: string[] = config.goodbye_triggers || [
                    'goodbye', 'bye', "that's all", 'no thanks', "i'm good", 'thank you',
                    'धन्यवाद', 'बस', 'ठीक है', 'नमस्ते', 'अलविदा',
                    'આભાર', 'બસ', 'ઠીક છે',
                ];
                if (goodbyeTriggers.some(t => fullTranscript.toLowerCase().includes(t.toLowerCase()))) {
                    console.log('[AGENT] Goodbye trigger detected. Cutting call instantly.');
                    void (async () => { await handleGoodbye(true); })();
                    return;
                }

                const result = validator.validate(fullTranscript, 1.0, 2000);

                if (!result.valid && result.reason) {
                    const phrase = validator.getClarificationPhrase(result.reason);
                    console.log(`[VALIDATOR] ❌ Invalid (${result.reason}): "${fullTranscript.slice(0, 60)}"`);
                    if (phrase) {
                        try { await session.say(phrase, { allowInterruptions: false }); }
                        catch (e) { console.error('[VALIDATOR] Clarification say failed:', e); }
                    } else {
                        silenceHandler.resetAndStart(state);
                    }
                    return;
                }

                console.log(`[VALIDATOR] ✅ Valid: "${fullTranscript.slice(0, 80)}"`);

            }, TRANSCRIPT_DEBOUNCE_MS);
        });

        // ─────────────────────────────────────────────────────────────────
        // Start Session
        // ─────────────────────────────────────────────────────────────────

        await session.start({ agent: voiceAgent, room: ctx.room });

        console.log('[AGENT] 🎙️  Agent is live and listening!');
        console.log(`[AGENT] VAD: threshold=${vadThreshold}, minSpeech=${vadMinSpeechMs}ms, minSilence=${vadMinSilenceMs}ms`);
        console.log('[AGENT] Endpointing: min=0.6s, max=2.5s');
        console.log(`[AGENT] Barge-in gate: ${bargeInMinMs}ms.`);
        if (totalSteps > 0) {
            console.log(`[WORKFLOW] ${totalSteps} step(s) loaded.`);
        }

        // ─────────────────────────────────────────────────────────────────
        // Participant joined → Opening greeting
        // ─────────────────────────────────────────────────────────────────

        ctx.room.on('participantConnected', async (participant) => {
            if (participant.identity === 'agent') return;
            console.log(`[AGENT] Human participant joined: ${participant.identity}`);

            silenceHandler.stop();

            await new Promise(r => setTimeout(r, 1000));

            let openingUtterance: string;
            if (totalSteps > 0) {
                const firstStepText = getCurrentStepText();
                openingUtterance = firstStepText
                    ? `Hello! I'll get started right away. ${firstStepText}`
                    : 'Hello! How can I help you today?';
            } else {
                openingUtterance = 'Hello! How can I help you today?';
            }

            console.log(`[AGENT] Opening: "${openingUtterance}"`);
            try {
                await session.say(openingUtterance, { allowInterruptions: false });
            } catch (e) {
                console.error('[AGENT] Error during opening say:', e);
            }

            state.greeting_delivered = true;
            console.log('[AGENT] Opening complete. Silence timer starts via SpeechCreated callback.');
        });

        // ─────────────────────────────────────────────────────────────────
        // Shutdown callback
        // ─────────────────────────────────────────────────────────────────

        ctx.addShutdownCallback(async () => {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            console.log(`[AGENT] Session ended. Duration: ${duration}s`);
            state.sessionClosed = true;
            silenceHandler.stop();
            await saveTranscript({
                agent_id: agentId,
                user_id: userId,
                session_id: sessionId,
                duration_seconds: duration,
                transcript_json: [],
                metadata: { avg_latency: 0 },
            });
        });
    },
});

// ─── Worker startup ───────────────────────────────────────────────────────────

cli.runApp(new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    initializeProcessTimeout: 60_000,
}));