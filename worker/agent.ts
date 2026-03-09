import { cli, defineAgent, JobContext, WorkerOptions, stt, llm, tts, voice } from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as openaiPlugin from '@livekit/agents-plugin-openai';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as googlePlugin from '@livekit/agents-plugin-google';
import * as elevenlabsPlugin from '@livekit/agents-plugin-elevenlabs'; // ✅ FIXED: Added ElevenLabs import
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { decrypt } from '../src/lib/encryption';
import { InputValidator } from './input-validator';
import { VALID_MODELS, DEFAULT_MODEL, resolveModel } from '../src/lib/constants/providers';

// ─── Environment ────────────────────────────────────────────────────────────
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

// ─── Types ──────────────────────────────────────────────────────────────────

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
    workflow_steps: any[];
    tools: any[];
    silence_behavior: any;
    key_overrides?: { [key: string]: string | undefined };
}

// ─── Session State ───────────────────────────────────────────────────────────

interface SessionState {
    // Lifecycle
    greeting_delivered: boolean;
    conversation_started: boolean;
    agent_speaking: boolean;
    goodbye_delivered: boolean;
    sessionClosed: boolean;   // set on Close event; guards all async callbacks
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
}

function makeState(): SessionState {
    return {
        greeting_delivered: false,
        conversation_started: false,
        agent_speaking: false,
        goodbye_delivered: false,
        sessionClosed: false,
        last_was_silence_message: false,
        silence_count: 0,
        last_user_utterance_time: 0,
        last_agent_speech_end: 0,
        last_valid_response_time: Date.now(),
        empty_response_count: 0,
        last_transcript: '',
        same_transcript_count: 0,
    };
}

// ─── VAD Strategy ────────────────────────────────────────────────────────────
// We do NOT use Silero VAD on Render workers.
// Silero runs ONNX inference on CPU for every 32-64ms audio frame. On Render's
// shared CPU tier this creates a 120 s+ "inference slower than realtime" spiral
// that causes the worker to choke and produce no audio output at all.
//
// Instead we rely on Deepgram's server-side endpointing (VAD built into the STT
// pipeline). Deepgram decides when the user has finished speaking and fires a
// final transcript — at zero CPU cost on our end. The AgentSession detects this
// via turnDetection: 'vad' (which works with Deepgram's own VAD signal), then
// immediately kicks off LLM → TTS → audio.
//
// Barge-in is controlled via voiceOptions.allowInterruptions +
// minInterruptionDuration at the session level — no local VAD needed.
const VAD_DEFAULTS = {
    // These are kept for reference / future Silero re-enablement on GPU workers
    threshold: 0.85,
    minSpeechDurationMs: 250,
    minSilenceDurationMs: 500,
    speechPadMs: 300,
    bargeInMinDurationMs: 300,
};

// ─── STT Defaults ────────────────────────────────────────────────────────────
const STT_DEFAULTS = {
    endpointing: 400,    // ms after end-of-speech before finalising transcript
    smartFormat: true,
    punctuate: true,
    noDelay: true,   // Reduce Deepgram internal buffering latency
};

// ─── Input Validation Defaults ───────────────────────────────────────────────
const INPUT_VALIDATION_DEFAULTS = {
    minWordCount: 2,
    minDurationMs: 1500,
    confidenceThreshold: 0.75,
    escalationThreshold: 3,
    maxConsecutiveInvalid: 5,
};

// ─── Anti-Hallucination Constants ────────────────────────────────────────────
// Maximum consecutive empty/whitespace responses before injecting a recovery prompt
const MAX_EMPTY_RESPONSES = 3;
// Minimum non-whitespace characters for a response to be considered valid
const MIN_VALID_RESPONSE_LENGTH = 5;

// NOTE: We intentionally do NOT implement a custom VAD proxy.
// The previous proxy wrote into the VAD WritableStream after it was already
// closed during session teardown, causing a flood of ERR_INVALID_STATE errors
// and keeping the Silero inference loop spinning for 120+ seconds after the
// call ended.  The SDK's native `minInterruptionDuration` voiceOption handles
// barge-in gating correctly without touching the stream internals.

// ─── API Key Resolution ──────────────────────────────────────────────────────

async function resolveApiKey(provider: string, agentRecord: any): Promise<string | null> {
    const providerKeyName = `${provider.toUpperCase()}_API_KEY`;

    if (agentRecord.config.key_overrides?.[provider]) {
        console.log(`[KEY] Using config override for ${provider}`);
        return agentRecord.config.key_overrides[provider];
    }

    const { data: userKey } = await supabase
        .from('api_keys')
        .select('key_encrypted')
        .eq('user_id', agentRecord.user_id)
        .eq('provider', provider)
        .maybeSingle();

    if (userKey?.key_encrypted) {
        try {
            const decrypted = decrypt(userKey.key_encrypted);
            console.log(`[KEY] Using Supabase-stored key for ${provider} (starts with: ${decrypted.slice(0, 4)}***)`);
            return decrypted;
        } catch (e) {
            console.error(`[KEY] Failed to decrypt key for provider ${provider}:`, e);
        }
    }

    const envKey = process.env[providerKeyName];
    if (envKey) {
        console.log(`[KEY] Using .env fallback for ${provider}`);
        return envKey;
    }

    console.warn(`[KEY] ⚠️  No API key found for provider: ${provider}`);
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

// ─── System Prompt Builder ───────────────────────────────────────────────────

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

    // Anti-hallucination rules appended to every prompt
    prompt += `

CRITICAL RESPONSE RULES — FOLLOW THESE EXACTLY:
1. NEVER generate an empty, whitespace-only, or single-character response. Every reply must contain at least one complete, meaningful sentence.
2. NEVER repeat what you just said verbatim in the same turn.
3. If you are unsure what to say, ask a clarifying question — do NOT stay silent.
4. Wait for the user to finish speaking before responding — do NOT interrupt mid-sentence with partial content.
5. If the user's message is unclear or too short, ask them to clarify — do NOT guess or make up facts.
6. Keep responses concise and natural for voice — avoid bullet points, markdown, or structured lists.`;

    return prompt;
}

// ─── Silence Handler ─────────────────────────────────────────────────────────

class SilenceHandler {
    private timer: NodeJS.Timeout | null = null;
    private running: boolean = false;
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
        this.scheduleNext();
        console.debug(`[SILENCE] Timer started — waiting ${this.timeoutMs}ms.`);
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
        console.debug('[SILENCE] Count reset. Fresh window started.');
    }

    private clearTimer() {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    }

    private scheduleNext() {
        if (!this.running) return;
        this.timer = setTimeout(async () => {
            if (!this.running) return;
            await this.onTimeout();
        }, this.timeoutMs);
    }
}

// ─── Response Validator ───────────────────────────────────────────────────────

function isValidResponse(text: string | undefined | null): boolean {
    if (!text) return false;
    const stripped = text.replace(/[\n\r\s\t]/g, '');
    return stripped.length >= MIN_VALID_RESPONSE_LENGTH;
}

// ─── Main Agent Entry ─────────────────────────────────────────────────────────

export default defineAgent({
    entry: async (ctx: JobContext) => {
        await ctx.connect();
        console.log(`[AGENT] Connected to room: ${ctx.room.name}`);

        const startTime = Date.now();
        const sessionId = ctx.room.name;

        // ── Parse room metadata ───────────────────────────────────────────────
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

        // ── Load agent config ─────────────────────────────────────────────────
        console.log(`[AGENT] Loading config for agent ID: ${agentId}`);
        const { data: agentRecord, error: agentError } = await supabase
            .from('agents')
            .select('*')
            .eq('id', agentId)
            .single();

        if (agentError || !agentRecord) {
            console.error(`[AGENT] Agent ${agentId} not found:`, agentError);
            return;
        }

        const config = agentRecord.config as AgentConfig;
        console.log(
            `[AGENT] Config loaded. STT: ${config.stt?.provider}, ` +
            `LLM: ${config.llm?.provider}, TTS: ${config.tts?.provider}`
        );

        // ── Resolve API keys ──────────────────────────────────────────────────
        const sttKey = await resolveApiKey(config.stt.provider, agentRecord);
        const llmKey = await resolveApiKey(config.llm.provider, agentRecord);
        const ttsKey = await resolveApiKey(config.tts.provider, agentRecord);

        // ── VAD parameters (kept for silence_timeout_ms and barge_in reads) ──
        const bargeInMinMs = config.vad?.barge_in_min_duration_ms ?? VAD_DEFAULTS.bargeInMinDurationMs;

        console.log(`[AGENT] barge_in=${config.vad?.barge_in ?? true}, minInterruption=${bargeInMinMs}ms`);

        // ── Build STT ─────────────────────────────────────────────────────────
        let sttInstance: stt.STT | undefined;
        if (config.stt.provider === 'deepgram' && sttKey) {
            sttInstance = new deepgram.STT({
                apiKey: sttKey,
                model: config.stt.model as any,
                endpointing: config.stt.options?.endpointing ?? 300,
                smartFormat: config.stt.options?.smart_format ?? STT_DEFAULTS.smartFormat,
                punctuate: config.stt.options?.punctuate ?? STT_DEFAULTS.punctuate,
                noDelay: config.stt.options?.no_delay ?? STT_DEFAULTS.noDelay,
                interimResults: true,
                language: config.language || 'en',
            } as any);
        }

        // ── Build LLM ─────────────────────────────────────────────────────────
        let llmInstance: llm.LLM;
        const provider = config.llm.provider;
        const resolvedModel = resolveModel(provider, config.llm.model);
        const temperature = config.llm.options?.temperature ?? 0.7;
        const maxTokens = config.llm.options?.max_tokens ?? 256;

        console.log(`[LLM] Provider: ${provider}, Model: ${resolvedModel}`);

        if (provider === 'groq') {
            llmInstance = new openaiPlugin.LLM({
                model: resolvedModel as any,
                apiKey: llmKey || undefined,
                baseURL: 'https://api.groq.com/openai/v1',
                temperature,
                maxCompletionTokens: maxTokens,
            });
        } else if (provider === 'gemini' || provider === 'google') {
            llmInstance = new googlePlugin.LLM({
                model: resolvedModel as any,
                apiKey: llmKey || undefined,
                temperature,
                maxOutputTokens: maxTokens,
            });
        } else if (provider === 'openai') {
            llmInstance = new openaiPlugin.LLM({
                model: resolvedModel as any,
                apiKey: llmKey || undefined,
                temperature,
                maxCompletionTokens: maxTokens,
            });
        } else if (provider === 'ollama') {
            llmInstance = new openaiPlugin.LLM({
                model: resolvedModel as any,
                apiKey: 'ollama',
                baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
                temperature,
                maxCompletionTokens: maxTokens,
            });
        } else if (provider === 'xai') {
            llmInstance = new openaiPlugin.LLM({
                model: resolvedModel as any,
                apiKey: llmKey || undefined,
                baseURL: 'https://api.x.ai/v1',
                temperature,
                maxCompletionTokens: maxTokens,
            });
        } else {
            throw new Error(
                `[LLM] Unknown provider: "${provider}". ` +
                `Supported: groq, gemini, google, openai, ollama, xai.`
            );
        }

        // ── Build TTS ─────────────────────────────────────────────────────────
        let ttsInstance: tts.TTS | undefined;

        if (config.tts.provider === 'cartesia' && ttsKey) {
            const cartesiaVoice = config.tts.voice || '794f9389-aac1-45b6-b726-9d9369183238';
            const cartesiaModel = config.tts.model || 'sonic-2';
            console.log(`[TTS] Cartesia voice: ${cartesiaVoice}, model: ${cartesiaModel}`);
            ttsInstance = new cartesia.TTS({
                apiKey: ttsKey,
                voice: cartesiaVoice,
                model: cartesiaModel as any,
            });

        } else if (config.tts.provider === 'elevenlabs' && ttsKey) {
            // ✅ FIXED: Now correctly uses elevenlabsPlugin instead of openaiPlugin
            const elVoice = config.tts.voice || '21m00Tcm4TlvDq8ikWAM';
            const elModel = config.tts.model || 'eleven_turbo_v2';
            console.log(`[TTS] ElevenLabs voice: ${elVoice}, model: ${elModel}`);
            ttsInstance = new elevenlabsPlugin.TTS({
                apiKey: ttsKey,
                voice: { voiceId: elVoice } as any,
                model: elModel as any,
            });

        } else if (config.tts.provider === 'openai' && ttsKey) {
            const openaiVoice = config.tts.voice || 'alloy';
            console.log(`[TTS] OpenAI voice: ${openaiVoice}`);
            ttsInstance = new openaiPlugin.TTS({ apiKey: ttsKey, voice: openaiVoice as any });
        }

        // ── Component check ───────────────────────────────────────────────────
        if (!sttInstance || !llmInstance || !ttsInstance) {
            console.error('[AGENT] ❌ Missing components:');
            console.error(`  STT (${config.stt.provider}): ${sttInstance ? '✅' : '❌ MISSING KEY'}`);
            console.error(`  LLM (${config.llm.provider}): ${llmInstance ? '✅' : '❌ MISSING KEY'}`);
            console.error(`  TTS (${config.tts.provider}): ${ttsInstance ? '✅' : '❌ MISSING KEY'}`);
            return;
        }

        // ── Session state ─────────────────────────────────────────────────────
        const state = makeState();

        console.log('[VAD] Using Deepgram server-side endpointing (no local Silero VAD).');

        // ── Input Validator ───────────────────────────────────────────────────
        const validator = new InputValidator(INPUT_VALIDATION_DEFAULTS);

        // ── System prompt ─────────────────────────────────────────────────────
        const systemPrompt = buildSystemPrompt(config);

        // ── Voice Agent ───────────────────────────────────────────────────────
        const voiceAgent = new voice.Agent({ instructions: systemPrompt });

        // ── Silence handler (forward-declared so event listeners can access it)
        let silenceHandler: SilenceHandler;

        // ── Agent Session ─────────────────────────────────────────────────────
        const session = new voice.AgentSession({
            stt: sttInstance,
            llm: llmInstance,
            tts: ttsInstance,
            turnDetection: 'vad',
            voiceOptions: {
                allowInterruptions: config.vad?.barge_in ?? true,
                minInterruptionDuration: (config.vad?.barge_in_min_duration_ms ?? VAD_DEFAULTS.bargeInMinDurationMs) / 1000,
            },
        });

        // ─────────────────────────────────────────────────────────────────────
        // Silence Handler
        // ─────────────────────────────────────────────────────────────────────

        const onSilenceTimeout = async () => {
            if (state.sessionClosed) return;
            if (!state.greeting_delivered) return;
            if (!state.conversation_started) return;
            if (state.agent_speaking) return;
            if (state.goodbye_delivered) return;

            state.silence_count += 1;
            console.log(`[SILENCE] User has been silent. Count: ${state.silence_count}`);

            const silenceMessages: string[] = config.silence_behavior?.messages || [
                "Are you still there? Take your time.",
                "I'll wait a moment longer.",
                "Thank you for your time. Have a great day!",
            ];

            if (state.silence_count === 1) {
                state.last_was_silence_message = true;
                try {
                    await session.say(silenceMessages[0] || "Are you still there? Take your time.", {
                        allowInterruptions: true,
                    });
                } catch (e) { console.error('[SILENCE] say error:', e); }

            } else if (state.silence_count === 2) {
                state.last_was_silence_message = true;
                try {
                    await session.say(silenceMessages[1] || "I'll wait just a moment longer.", {
                        allowInterruptions: true,
                    });
                } catch (e) { console.error('[SILENCE] say error:', e); }

            } else {
                state.goodbye_delivered = true;
                silenceHandler.stop();
                const goodbyeMsg = silenceMessages[2] || "Thank you for your time. Have a great day!";
                try {
                    await session.say(goodbyeMsg, { allowInterruptions: false });
                } catch (e) { console.error('[SILENCE] say error:', e); }
            }
        };

        const firstTimeoutMs = config.vad?.first_response_timeout_secs
            ? config.vad.first_response_timeout_secs * 1000
            : 20_000;

        silenceHandler = new SilenceHandler(firstTimeoutMs, onSilenceTimeout);

        // ─────────────────────────────────────────────────────────────────────
        // Session Event Listeners
        // ─────────────────────────────────────────────────────────────────────

        session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
            state.agent_speaking = (event.newState === 'speaking');

            if (event.newState === 'speaking') {
                silenceHandler.stop();
                console.debug('[SILENCE] Stopped — agent is speaking.');
            }
        });

        session.on(voice.AgentSessionEventTypes.SpeechCreated, (event) => {
            event.speechHandle.addDoneCallback(async (sh: any) => {
                if (state.sessionClosed) return;

                state.agent_speaking = false;
                state.last_agent_speech_end = Date.now();

                if (state.goodbye_delivered) {
                    setTimeout(async () => {
                        if (state.sessionClosed) return;
                        console.log('[AGENT] Goodbye message finished. Disconnecting room.');
                        const duration = Math.floor((Date.now() - startTime) / 1000);
                        await saveTranscript({
                            agent_id: agentId,
                            user_id: userId,
                            session_id: sessionId,
                            duration_seconds: duration,
                            transcript_json: [],
                            metadata: { avg_latency: 0 },
                        });
                        try { await ctx.room.disconnect(); } catch (_e) { }
                    }, 2000);
                    return;
                }

                const messageContent = (sh.chatItems || [])
                    .map((c: any) => c.content || c.text || '')
                    .join('');

                const wasEmpty = !messageContent || messageContent.trim().length < MIN_VALID_RESPONSE_LENGTH;
                const wasEmptyInterrupt = sh.interrupted && (!messageContent || messageContent.trim() === '');

                if (wasEmpty && !wasEmptyInterrupt) {
                    state.empty_response_count++;
                    console.warn(
                        `[ANTI-HALLUCINATION] Empty/short response detected ` +
                        `(count: ${state.empty_response_count}). Content: "${messageContent?.slice(0, 60)}"`
                    );

                    if (state.empty_response_count >= MAX_EMPTY_RESPONSES) {
                        console.error('[ANTI-HALLUCINATION] Max empty responses reached. Injecting recovery.');
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

                if (wasEmptyInterrupt) {
                    console.debug('[AGENT] Empty interrupt — stale VAD. Restarting silence timer.');
                    if (state.silence_count < 3) { silenceHandler.startWaiting(); }
                    return;
                }

                if (state.last_was_silence_message) {
                    state.last_was_silence_message = false;
                    console.debug('[SILENCE] Silence message delivered. Restarting timer.');
                    silenceHandler.startWaiting();
                } else {
                    console.debug('[SILENCE] Agent response complete. Resetting count and starting wait.');
                    silenceHandler.resetAndStart(state);
                }
            });
        });

        session.on(voice.AgentSessionEventTypes.Close, () => {
            console.log('[AGENT] Session closed. Setting sessionClosed guard and stopping silence handler.');
            state.sessionClosed = true;
            silenceHandler.stop();
        });

        (session as any).on('error', (error: any) => {
            console.error('[SESSION] Session error:', error?.context?.type, error?.context?.error?.name);
            if (error?.context?.type === 'llm_error') {
                console.error('[LLM] LLM error. Provider may be misconfigured or unreachable.');
            }
        });

        (session as any).on('llm_error', (error: any) => {
            console.error('[AGENT] ❌ LLM error occurred:', error.message);
            if (error.recoverable) {
                try {
                    session.say(
                        "I'm having a little trouble right now. Give me just a moment.",
                        { allowInterruptions: true }
                    );
                } catch (_e) { }
            } else {
                console.error('[AGENT] 🛑 CRITICAL: Unrecoverable LLM error, ending session.');
                try {
                    session.say(
                        "I'm sorry, I'm experiencing a technical issue and need to end our call. " +
                        "Please try again shortly.",
                        { allowInterruptions: false }
                    );
                } catch (_e) { }
                setTimeout(() => ctx.room.disconnect(), 5000);
            }
        });

        // ─────────────────────────────────────────────────────────────────────
        // User Input Transcription Handler
        // ─────────────────────────────────────────────────────────────────────

        session.on(voice.AgentSessionEventTypes.UserInputTranscribed, async (event) => {
            if (!(event as any).isFinal) return;
            if (state.sessionClosed) return;

            state.last_user_utterance_time = Date.now();

            const transcript: string = (event as any).transcript ?? '';
            const confidence: number = 1.0;
            const durationMs: number = 2000;

            if (transcript === state.last_transcript) {
                state.same_transcript_count++;
                if (state.same_transcript_count >= 3) {
                    console.warn(
                        `[ANTI-HALLUCINATION] Transcript repeated ${state.same_transcript_count} times: ` +
                        `"${transcript.slice(0, 60)}". Possible VAD feedback loop.`
                    );
                    return;
                }
            } else {
                state.same_transcript_count = 0;
                state.last_transcript = transcript;
            }

            if (!state.conversation_started) {
                state.conversation_started = true;
                console.log('[AGENT] First user utterance received. Conversation started.');
                const normalTimeout = Math.max(config.vad?.silence_timeout_ms || 8000, 5000);
                silenceHandler.setTimeoutDuration(normalTimeout);
            }

            console.debug('[SILENCE] User utterance committed. Waiting for agent response.');

            const goodbyeTriggers: string[] = config.goodbye_triggers || [
                "goodbye", "bye", "that's all", "no thanks", "i'm good", "thank you",
                "धन्यवाद", "बस", "ठीक है", "नमस्ते", "अलविदा",
                "આભાર", "બસ", "ઠીક છે",
            ];
            const tLower = transcript.toLowerCase();
            const isGoodbye = goodbyeTriggers.some(t => tLower.includes(t.toLowerCase()));

            if (isGoodbye) {
                state.goodbye_delivered = true;
                silenceHandler.stop();
                const goodbyeMsg = config.silence_behavior?.messages?.[2] || "Thank you for your time. Have a great day!";
                try { session.say(goodbyeMsg, { allowInterruptions: false }); }
                catch (e) { console.error('[GOODBYE] Error during say:', e); }
                return;
            }

            const result = validator.validate(transcript, confidence, durationMs);

            if (!result.valid && result.reason) {
                const phrase = validator.getClarificationPhrase(result.reason);
                console.log(`[VALIDATOR] ❌ Invalid input (${result.reason}): "${transcript.slice(0, 60)}"`);

                if (phrase) {
                    try { session.say(phrase, { allowInterruptions: false }); }
                    catch (e) { console.error('[VALIDATOR] Failed to speak clarification phrase:', e); }
                } else {
                    console.log(`[VALIDATOR] Silent pass (${result.reason}) — staying in listening state.`);
                }
                return;
            }

            if (result.valid) {
                console.log(`[VALIDATOR] ✅ Valid input: "${transcript.slice(0, 60)}"`);
            }
        });

        // ─────────────────────────────────────────────────────────────────────
        // Start Session
        // ─────────────────────────────────────────────────────────────────────

        await session.start({ agent: voiceAgent, room: ctx.room });

        console.log('[AGENT] 🎙️  Agent is live and listening! (Deepgram VAD, no local Silero)');
        console.log(`[AGENT] Barge-in: ${config.vad?.barge_in ?? true}, min interruption: ${bargeInMinMs}ms`);

        // ─────────────────────────────────────────────────────────────────────
        // Participant joined → Greeting
        // ─────────────────────────────────────────────────────────────────────

        ctx.room.on('participantConnected', async (participant) => {
            if (participant.identity === 'agent') return;
            console.log(`[AGENT] Human participant joined: ${participant.identity}`);

            silenceHandler.stop();

            await new Promise(r => setTimeout(r, 800));

            const greetingPhrase = "Hello, how can I help you today?";
            console.log('[AGENT] Delivering greeting...');
            try {
                await session.say(greetingPhrase, { allowInterruptions: false });
            } catch (e) {
                console.error('[AGENT] Error during greeting say:', e);
            }

            state.greeting_delivered = true;
            console.log('[AGENT] Greeting complete. Silence timer will start via SpeechCreated callback.');
        });

        // ─────────────────────────────────────────────────────────────────────
        // Shutdown callback
        // ─────────────────────────────────────────────────────────────────────

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
    agent: __filename,
    initializeProcessTimeout: 60_000,
    port: parseInt(process.env.PORT || '8081', 10),
    host: '0.0.0.0',
}));