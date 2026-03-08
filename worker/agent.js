"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var agents_1 = require("@livekit/agents");
var deepgram = require("@livekit/agents-plugin-deepgram");
var openaiPlugin = require("@livekit/agents-plugin-openai");
var cartesia = require("@livekit/agents-plugin-cartesia");
var googlePlugin = require("@livekit/agents-plugin-google");
var supabase_js_1 = require("@supabase/supabase-js");
var dotenv = require("dotenv");
var path_1 = require("path");
var encryption_1 = require("../src/lib/encryption");
var input_validator_1 = require("./input-validator");
var providers_1 = require("../src/lib/constants/providers");
// ─── Environment ────────────────────────────────────────────────────────────
var envPath = path_1.default.join(process.cwd(), '.env.local');
dotenv.config({ path: envPath });
console.log("[WORKER] Loading env from ".concat(envPath));
process.on('unhandledRejection', function (reason) {
    var _a;
    console.error('[WORKER] Unhandled rejection caught at process level:', (_a = reason === null || reason === void 0 ? void 0 : reason.message) !== null && _a !== void 0 ? _a : reason);
    // Do NOT exit — let the worker recover
});
if (!process.env.LIVEKIT_URL) {
    process.env.LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL;
}
var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
var appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials missing for worker');
}
var supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
function makeState() {
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
var VAD_DEFAULTS = {
    // These are kept for reference / future Silero re-enablement on GPU workers
    threshold: 0.85,
    minSpeechDurationMs: 250,
    minSilenceDurationMs: 500,
    speechPadMs: 300,
    bargeInMinDurationMs: 300,
};
// ─── STT Defaults ────────────────────────────────────────────────────────────
var STT_DEFAULTS = {
    endpointing: 400, // ms after end-of-speech before finalising transcript
    smartFormat: true,
    punctuate: true,
    noDelay: true, // Reduce Deepgram internal buffering latency
};
// ─── Input Validation Defaults ───────────────────────────────────────────────
var INPUT_VALIDATION_DEFAULTS = {
    minWordCount: 2,
    minDurationMs: 1500,
    confidenceThreshold: 0.75,
    escalationThreshold: 3,
    maxConsecutiveInvalid: 5,
};
// ─── Anti-Hallucination Constants ────────────────────────────────────────────
// Maximum consecutive empty/whitespace responses before injecting a recovery prompt
var MAX_EMPTY_RESPONSES = 3;
// Minimum non-whitespace characters for a response to be considered valid
var MIN_VALID_RESPONSE_LENGTH = 5;
// NOTE: We intentionally do NOT implement a custom VAD proxy.
// The previous proxy wrote into the VAD WritableStream after it was already
// closed during session teardown, causing a flood of ERR_INVALID_STATE errors
// and keeping the Silero inference loop spinning for 120+ seconds after the
// call ended.  The SDK's native `minInterruptionDuration` voiceOption handles
// barge-in gating correctly without touching the stream internals.
// ─── API Key Resolution ──────────────────────────────────────────────────────
function resolveApiKey(provider, agentRecord) {
    return __awaiter(this, void 0, void 0, function () {
        var providerKeyName, userKey, decrypted, envKey;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    providerKeyName = "".concat(provider.toUpperCase(), "_API_KEY");
                    if ((_a = agentRecord.config.key_overrides) === null || _a === void 0 ? void 0 : _a[provider]) {
                        console.log("[KEY] Using config override for ".concat(provider));
                        return [2 /*return*/, agentRecord.config.key_overrides[provider]];
                    }
                    return [4 /*yield*/, supabase
                            .from('api_keys')
                            .select('key_encrypted')
                            .eq('user_id', agentRecord.user_id)
                            .eq('provider', provider)
                            .maybeSingle()];
                case 1:
                    userKey = (_b.sent()).data;
                    if (userKey === null || userKey === void 0 ? void 0 : userKey.key_encrypted) {
                        try {
                            decrypted = (0, encryption_1.decrypt)(userKey.key_encrypted);
                            console.log("[KEY] Using Supabase-stored key for ".concat(provider, " (starts with: ").concat(decrypted.slice(0, 4), "***)"));
                            return [2 /*return*/, decrypted];
                        }
                        catch (e) {
                            console.error("[KEY] Failed to decrypt key for provider ".concat(provider, ":"), e);
                        }
                    }
                    envKey = process.env[providerKeyName];
                    if (envKey) {
                        console.log("[KEY] Using .env fallback for ".concat(provider));
                        return [2 /*return*/, envKey];
                    }
                    console.warn("[KEY] \u26A0\uFE0F  No API key found for provider: ".concat(provider));
                    return [2 /*return*/, null];
            }
        });
    });
}
// ─── Transcript Save ──────────────────────────────────────────────────────────
function saveTranscript(data) {
    return __awaiter(this, void 0, void 0, function () {
        var response, _a, _b, _c, err_1;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, fetch("".concat(appUrl, "/api/transcripts"), {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': "Bearer ".concat(process.env.SUPABASE_SERVICE_ROLE_KEY),
                            },
                            body: JSON.stringify(data),
                        })];
                case 1:
                    response = _d.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    _b = (_a = console).error;
                    _c = ['[TRANSCRIPT] Failed to save:'];
                    return [4 /*yield*/, response.text()];
                case 2:
                    _b.apply(_a, _c.concat([_d.sent()]));
                    return [3 /*break*/, 4];
                case 3:
                    console.log('[TRANSCRIPT] Saved successfully.');
                    _d.label = 4;
                case 4: return [3 /*break*/, 6];
                case 5:
                    err_1 = _d.sent();
                    console.error('[TRANSCRIPT] Error saving:', err_1);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// ─── System Prompt Builder ───────────────────────────────────────────────────
function buildGenderRules(lang, gender) {
    if (lang === 'hi' || lang === 'hindi') {
        if (gender === 'female') {
            return "LANGUAGE AND GENDER RULES \u2014 HINDI:\nYou are a female assistant. In all Hindi responses, use feminine grammatical forms.\n\nVerb conjugations \u2014 use feminine forms:\n- Use \u0915\u0930\u0942\u0902\u0917\u0940 (not \u0915\u0930\u0942\u0902\u0917\u093E)\n- Use \u092C\u0924\u093E\u090A\u0902\u0917\u0940 (not \u092C\u0924\u093E\u090A\u0902\u0917\u093E)\n- Use \u0938\u092E\u091D\u0942\u0902\u0917\u0940 (not \u0938\u092E\u091D\u0942\u0902\u0917\u093E)\n- Use \u0915\u0930 \u0938\u0915\u0924\u0940 \u0939\u0942\u0902 (not \u0915\u0930 \u0938\u0915\u0924\u093E \u0939\u0942\u0902)\n\nSelf-reference: Always use \u092E\u0948\u0902 with feminine verb endings.\nAdjectives referring to yourself: Use \u0906\u092A\u0915\u0940 \u0938\u0939\u093E\u092F\u0915 \u0939\u0942\u0902 (not \u0906\u092A\u0915\u093E \u0938\u0939\u093E\u092F\u0915).\nSpeak naturally in Hindi. Keep responses short \u2014 1 to 2 sentences.";
        }
        else if (gender === 'male') {
            return "LANGUAGE AND GENDER RULES \u2014 HINDI:\nYou are a male assistant. Use masculine Hindi grammar throughout.";
        }
    }
    else if (lang === 'gu' || lang === 'gujarati') {
        if (gender === 'female') {
            return "LANGUAGE AND GENDER RULES \u2014 GUJARATI:\nYou are a female assistant. Use feminine Gujarati grammatical forms.";
        }
    }
    return null;
}
function buildSystemPrompt(config) {
    var _a, _b;
    var prompt = config.system_prompt || 'You are a helpful voice assistant.';
    var gender = config.voice_gender || 'neutral';
    var lang = config.language || ((_b = (_a = config.stt) === null || _a === void 0 ? void 0 : _a.options) === null || _b === void 0 ? void 0 : _b.language) || 'en';
    if (lang === 'hi' || lang === 'hindi' || lang === 'gu' || lang === 'gujarati') {
        if (gender !== 'neutral') {
            var rulesBlock = buildGenderRules(lang, gender);
            if (rulesBlock)
                prompt += '\n\n' + rulesBlock;
        }
    }
    else if ((lang === 'en' || lang === 'english') && gender === 'female') {
        prompt += '\n\nYou are a female assistant. Refer to yourself using she/her pronouns if asked.';
    }
    // Anti-hallucination rules appended to every prompt
    prompt += "\n\nCRITICAL RESPONSE RULES \u2014 FOLLOW THESE EXACTLY:\n1. NEVER generate an empty, whitespace-only, or single-character response. Every reply must contain at least one complete, meaningful sentence.\n2. NEVER repeat what you just said verbatim in the same turn.\n3. If you are unsure what to say, ask a clarifying question \u2014 do NOT stay silent.\n4. Wait for the user to finish speaking before responding \u2014 do NOT interrupt mid-sentence with partial content.\n5. If the user's message is unclear or too short, ask them to clarify \u2014 do NOT guess or make up facts.\n6. Keep responses concise and natural for voice \u2014 avoid bullet points, markdown, or structured lists.";
    return prompt;
}
// ─── Silence Handler ─────────────────────────────────────────────────────────
var SilenceHandler = /** @class */ (function () {
    function SilenceHandler(timeoutMs, onTimeout) {
        this.timer = null;
        this.running = false;
        this.timeoutMs = timeoutMs;
        this.onTimeout = onTimeout;
    }
    SilenceHandler.prototype.setTimeoutDuration = function (ms) { this.timeoutMs = ms; };
    SilenceHandler.prototype.startWaiting = function () {
        this.clearTimer();
        this.running = true;
        this.scheduleNext();
        console.debug("[SILENCE] Timer started \u2014 waiting ".concat(this.timeoutMs, "ms."));
    };
    SilenceHandler.prototype.stop = function () {
        this.clearTimer();
        this.running = false;
        console.debug('[SILENCE] Timer stopped.');
    };
    SilenceHandler.prototype.resetAndStart = function (state) {
        state.silence_count = 0;
        state.last_was_silence_message = false;
        this.startWaiting();
        console.debug('[SILENCE] Count reset. Fresh window started.');
    };
    SilenceHandler.prototype.clearTimer = function () {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    };
    SilenceHandler.prototype.scheduleNext = function () {
        var _this = this;
        if (!this.running)
            return;
        this.timer = setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.running)
                            return [2 /*return*/];
                        return [4 /*yield*/, this.onTimeout()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }, this.timeoutMs);
    };
    return SilenceHandler;
}());
// ─── Response Validator ───────────────────────────────────────────────────────
function isValidResponse(text) {
    if (!text)
        return false;
    var stripped = text.replace(/[\n\r\s\t]/g, '');
    return stripped.length >= MIN_VALID_RESPONSE_LENGTH;
}
// ─── Main Agent Entry ─────────────────────────────────────────────────────────
exports.default = (0, agents_1.defineAgent)({
    entry: function (ctx) { return __awaiter(void 0, void 0, void 0, function () {
        var startTime, sessionId, metadata, agentId, userId, _a, agentRecord, agentError, config, sttKey, llmKey, ttsKey, bargeInMinMs, sttInstance, llmInstance, provider, resolvedModel, temperature, maxTokens, ttsInstance, cartesiaVoice, cartesiaModel, openaiVoice, elVoice, state, validator, systemPrompt, voiceAgent, silenceHandler, session, onSilenceTimeout, firstTimeoutMs;
        var _b, _c, _d, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4;
        return __generator(this, function (_5) {
            switch (_5.label) {
                case 0: return [4 /*yield*/, ctx.connect()];
                case 1:
                    _5.sent();
                    console.log("[AGENT] Connected to room: ".concat(ctx.room.name));
                    startTime = Date.now();
                    sessionId = ctx.room.name;
                    metadata = {};
                    try {
                        metadata = JSON.parse(ctx.room.metadata || '{}');
                    }
                    catch (e) {
                        console.error('[AGENT] Failed to parse room metadata:', ctx.room.metadata);
                    }
                    agentId = metadata.agent_id;
                    userId = metadata.user_id;
                    if (!agentId) {
                        console.error('[AGENT] No agent_id in room metadata. Exiting.');
                        return [2 /*return*/];
                    }
                    // ── Load agent config ─────────────────────────────────────────────────
                    console.log("[AGENT] Loading config for agent ID: ".concat(agentId));
                    return [4 /*yield*/, supabase
                            .from('agents')
                            .select('*')
                            .eq('id', agentId)
                            .single()];
                case 2:
                    _a = _5.sent(), agentRecord = _a.data, agentError = _a.error;
                    if (agentError || !agentRecord) {
                        console.error("[AGENT] Agent ".concat(agentId, " not found:"), agentError);
                        return [2 /*return*/];
                    }
                    config = agentRecord.config;
                    console.log("[AGENT] Config loaded. STT: ".concat((_b = config.stt) === null || _b === void 0 ? void 0 : _b.provider, ", ") +
                        "LLM: ".concat((_c = config.llm) === null || _c === void 0 ? void 0 : _c.provider, ", TTS: ").concat((_d = config.tts) === null || _d === void 0 ? void 0 : _d.provider));
                    return [4 /*yield*/, resolveApiKey(config.stt.provider, agentRecord)];
                case 3:
                    sttKey = _5.sent();
                    return [4 /*yield*/, resolveApiKey(config.llm.provider, agentRecord)];
                case 4:
                    llmKey = _5.sent();
                    return [4 /*yield*/, resolveApiKey(config.tts.provider, agentRecord)];
                case 5:
                    ttsKey = _5.sent();
                    bargeInMinMs = (_g = (_f = config.vad) === null || _f === void 0 ? void 0 : _f.barge_in_min_duration_ms) !== null && _g !== void 0 ? _g : VAD_DEFAULTS.bargeInMinDurationMs;
                    console.log("[AGENT] barge_in=".concat((_j = (_h = config.vad) === null || _h === void 0 ? void 0 : _h.barge_in) !== null && _j !== void 0 ? _j : true, ", minInterruption=").concat(bargeInMinMs, "ms"));
                    if (config.stt.provider === 'deepgram' && sttKey) {
                        sttInstance = new deepgram.STT({
                            apiKey: sttKey,
                            model: config.stt.model,
                            endpointing: (_l = (_k = config.stt.options) === null || _k === void 0 ? void 0 : _k.endpointing) !== null && _l !== void 0 ? _l : 300, // 300ms (was 400) — tighter EOU
                            smartFormat: (_o = (_m = config.stt.options) === null || _m === void 0 ? void 0 : _m.smart_format) !== null && _o !== void 0 ? _o : STT_DEFAULTS.smartFormat,
                            punctuate: (_q = (_p = config.stt.options) === null || _p === void 0 ? void 0 : _p.punctuate) !== null && _q !== void 0 ? _q : STT_DEFAULTS.punctuate,
                            noDelay: (_s = (_r = config.stt.options) === null || _r === void 0 ? void 0 : _r.no_delay) !== null && _s !== void 0 ? _s : STT_DEFAULTS.noDelay,
                            interimResults: true, // required for turnDetection:'vad' with Deepgram
                            language: config.language || 'en',
                        });
                    }
                    provider = config.llm.provider;
                    resolvedModel = (0, providers_1.resolveModel)(provider, config.llm.model);
                    temperature = (_u = (_t = config.llm.options) === null || _t === void 0 ? void 0 : _t.temperature) !== null && _u !== void 0 ? _u : 0.7;
                    maxTokens = (_w = (_v = config.llm.options) === null || _v === void 0 ? void 0 : _v.max_tokens) !== null && _w !== void 0 ? _w : 256;
                    console.log("[LLM] Provider: ".concat(provider, ", Model: ").concat(resolvedModel));
                    if (provider === 'groq') {
                        llmInstance = new openaiPlugin.LLM({
                            model: resolvedModel,
                            apiKey: llmKey || undefined,
                            baseURL: 'https://api.groq.com/openai/v1',
                            temperature: temperature,
                            maxCompletionTokens: maxTokens,
                        });
                    }
                    else if (provider === 'gemini' || provider === 'google') {
                        llmInstance = new googlePlugin.LLM({
                            model: resolvedModel,
                            apiKey: llmKey || undefined,
                            temperature: temperature,
                            maxOutputTokens: maxTokens,
                        });
                    }
                    else if (provider === 'openai') {
                        llmInstance = new openaiPlugin.LLM({
                            model: resolvedModel,
                            apiKey: llmKey || undefined,
                            temperature: temperature,
                            maxCompletionTokens: maxTokens,
                        });
                    }
                    else if (provider === 'ollama') {
                        llmInstance = new openaiPlugin.LLM({
                            model: resolvedModel,
                            apiKey: 'ollama',
                            baseURL: (_x = process.env.OLLAMA_BASE_URL) !== null && _x !== void 0 ? _x : 'http://localhost:11434/v1',
                            temperature: temperature,
                            maxCompletionTokens: maxTokens,
                        });
                    }
                    else if (provider === 'xai') {
                        llmInstance = new openaiPlugin.LLM({
                            model: resolvedModel,
                            apiKey: llmKey || undefined,
                            baseURL: 'https://api.x.ai/v1',
                            temperature: temperature,
                            maxCompletionTokens: maxTokens,
                        });
                    }
                    else {
                        throw new Error("[LLM] Unknown provider: \"".concat(provider, "\". ") +
                            "Supported: groq, gemini, google, openai, ollama, xai.");
                    }
                    if (config.tts.provider === 'cartesia' && ttsKey) {
                        cartesiaVoice = config.tts.voice || '794f9389-aac1-45b6-b726-9d9369183238';
                        cartesiaModel = config.tts.model || 'sonic-2';
                        console.log("[TTS] Cartesia voice: ".concat(cartesiaVoice, ", model: ").concat(cartesiaModel));
                        ttsInstance = new cartesia.TTS({
                            apiKey: ttsKey,
                            voice: cartesiaVoice,
                            model: cartesiaModel,
                        });
                    }
                    else if (config.tts.provider === 'openai' && ttsKey) {
                        openaiVoice = config.tts.voice || 'alloy';
                        console.log("[TTS] OpenAI voice: ".concat(openaiVoice));
                        ttsInstance = new openaiPlugin.TTS({ apiKey: ttsKey, voice: openaiVoice });
                    }
                    else if (config.tts.provider === 'elevenlabs' && ttsKey) {
                        elVoice = config.tts.voice || '21m00Tcm4TlvDq8ikWAM';
                        console.log("[TTS] ElevenLabs voice: ".concat(elVoice));
                        ttsInstance = new openaiPlugin.TTS({ apiKey: ttsKey, voice: elVoice });
                    }
                    // ── Component check ───────────────────────────────────────────────────
                    if (!sttInstance || !llmInstance || !ttsInstance) {
                        console.error('[AGENT] ❌ Missing components:');
                        console.error("  STT (".concat(config.stt.provider, "): ").concat(sttInstance ? '✅' : '❌ MISSING KEY'));
                        console.error("  LLM (".concat(config.llm.provider, "): ").concat(llmInstance ? '✅' : '❌ MISSING KEY'));
                        console.error("  TTS (".concat(config.tts.provider, "): ").concat(ttsInstance ? '✅' : '❌ MISSING KEY'));
                        return [2 /*return*/];
                    }
                    state = makeState();
                    // ── No local VAD ──────────────────────────────────────────────────────
                    // Silero is intentionally omitted on Render CPU workers — see VAD_DEFAULTS
                    // comment at the top of this file for the full explanation.
                    // Turn detection is handled by Deepgram's built-in endpointing.
                    console.log('[VAD] Using Deepgram server-side endpointing (no local Silero VAD).');
                    validator = new input_validator_1.InputValidator(INPUT_VALIDATION_DEFAULTS);
                    systemPrompt = buildSystemPrompt(config);
                    voiceAgent = new agents_1.voice.Agent({ instructions: systemPrompt });
                    session = new agents_1.voice.AgentSession({
                        stt: sttInstance,
                        llm: llmInstance,
                        tts: ttsInstance,
                        turnDetection: 'vad',
                        voiceOptions: {
                            allowInterruptions: (_z = (_y = config.vad) === null || _y === void 0 ? void 0 : _y.barge_in) !== null && _z !== void 0 ? _z : true,
                            minInterruptionDuration: ((_1 = (_0 = config.vad) === null || _0 === void 0 ? void 0 : _0.barge_in_min_duration_ms) !== null && _1 !== void 0 ? _1 : VAD_DEFAULTS.bargeInMinDurationMs) / 1000,
                        },
                    });
                    onSilenceTimeout = function () { return __awaiter(void 0, void 0, void 0, function () {
                        var silenceMessages, e_1, e_2, goodbyeMsg, e_3;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    if (state.sessionClosed)
                                        return [2 /*return*/]; // ← guard: session already torn down
                                    if (!state.greeting_delivered)
                                        return [2 /*return*/];
                                    if (!state.conversation_started)
                                        return [2 /*return*/];
                                    if (state.agent_speaking)
                                        return [2 /*return*/];
                                    if (state.goodbye_delivered)
                                        return [2 /*return*/];
                                    state.silence_count += 1;
                                    console.log("[SILENCE] User has been silent. Count: ".concat(state.silence_count));
                                    silenceMessages = ((_a = config.silence_behavior) === null || _a === void 0 ? void 0 : _a.messages) || [
                                        "Are you still there? Take your time.",
                                        "I'll wait a moment longer.",
                                        "Thank you for your time. Have a great day!",
                                    ];
                                    if (!(state.silence_count === 1)) return [3 /*break*/, 5];
                                    state.last_was_silence_message = true;
                                    _b.label = 1;
                                case 1:
                                    _b.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, session.say(silenceMessages[0] || "Are you still there? Take your time.", {
                                            allowInterruptions: true,
                                        })];
                                case 2:
                                    _b.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    e_1 = _b.sent();
                                    console.error('[SILENCE] say error:', e_1);
                                    return [3 /*break*/, 4];
                                case 4: return [3 /*break*/, 14];
                                case 5:
                                    if (!(state.silence_count === 2)) return [3 /*break*/, 10];
                                    state.last_was_silence_message = true;
                                    _b.label = 6;
                                case 6:
                                    _b.trys.push([6, 8, , 9]);
                                    return [4 /*yield*/, session.say(silenceMessages[1] || "I'll wait just a moment longer.", {
                                            allowInterruptions: true,
                                        })];
                                case 7:
                                    _b.sent();
                                    return [3 /*break*/, 9];
                                case 8:
                                    e_2 = _b.sent();
                                    console.error('[SILENCE] say error:', e_2);
                                    return [3 /*break*/, 9];
                                case 9: return [3 /*break*/, 14];
                                case 10:
                                    // Third silence → goodbye
                                    state.goodbye_delivered = true;
                                    silenceHandler.stop();
                                    goodbyeMsg = silenceMessages[2] || "Thank you for your time. Have a great day!";
                                    _b.label = 11;
                                case 11:
                                    _b.trys.push([11, 13, , 14]);
                                    return [4 /*yield*/, session.say(goodbyeMsg, { allowInterruptions: false })];
                                case 12:
                                    _b.sent();
                                    return [3 /*break*/, 14];
                                case 13:
                                    e_3 = _b.sent();
                                    console.error('[SILENCE] say error:', e_3);
                                    return [3 /*break*/, 14];
                                case 14: return [2 /*return*/];
                            }
                        });
                    }); };
                    firstTimeoutMs = ((_2 = config.vad) === null || _2 === void 0 ? void 0 : _2.first_response_timeout_secs)
                        ? config.vad.first_response_timeout_secs * 1000
                        : 20000;
                    silenceHandler = new SilenceHandler(firstTimeoutMs, onSilenceTimeout);
                    // ─────────────────────────────────────────────────────────────────────
                    // Session Event Listeners
                    // ─────────────────────────────────────────────────────────────────────
                    // Track agent speaking state
                    session.on(agents_1.voice.AgentSessionEventTypes.AgentStateChanged, function (event) {
                        state.agent_speaking = (event.newState === 'speaking');
                        if (event.newState === 'speaking') {
                            silenceHandler.stop();
                            console.debug('[SILENCE] Stopped — agent is speaking.');
                        }
                    });
                    // On each speech handle completion
                    session.on(agents_1.voice.AgentSessionEventTypes.SpeechCreated, function (event) {
                        event.speechHandle.addDoneCallback(function (sh) { return __awaiter(void 0, void 0, void 0, function () {
                            var messageContent, wasEmpty, wasEmptyInterrupt, e_4;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (state.sessionClosed)
                                            return [2 /*return*/]; // ← guard: session already torn down
                                        state.agent_speaking = false;
                                        state.last_agent_speech_end = Date.now();
                                        // ── Goodbye → disconnect ─────────────────────────────────
                                        if (state.goodbye_delivered) {
                                            setTimeout(function () { return __awaiter(void 0, void 0, void 0, function () {
                                                var duration, _e_1;
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0:
                                                            if (state.sessionClosed)
                                                                return [2 /*return*/];
                                                            console.log('[AGENT] Goodbye message finished. Disconnecting room.');
                                                            duration = Math.floor((Date.now() - startTime) / 1000);
                                                            return [4 /*yield*/, saveTranscript({
                                                                    agent_id: agentId,
                                                                    user_id: userId,
                                                                    session_id: sessionId,
                                                                    duration_seconds: duration,
                                                                    transcript_json: [],
                                                                    metadata: { avg_latency: 0 },
                                                                })];
                                                        case 1:
                                                            _a.sent();
                                                            _a.label = 2;
                                                        case 2:
                                                            _a.trys.push([2, 4, , 5]);
                                                            return [4 /*yield*/, ctx.room.disconnect()];
                                                        case 3:
                                                            _a.sent();
                                                            return [3 /*break*/, 5];
                                                        case 4:
                                                            _e_1 = _a.sent();
                                                            return [3 /*break*/, 5];
                                                        case 5: return [2 /*return*/];
                                                    }
                                                });
                                            }); }, 2000);
                                            return [2 /*return*/];
                                        }
                                        messageContent = (sh.chatItems || [])
                                            .map(function (c) { return c.content || c.text || ''; })
                                            .join('');
                                        wasEmpty = !messageContent || messageContent.trim().length < MIN_VALID_RESPONSE_LENGTH;
                                        wasEmptyInterrupt = sh.interrupted && (!messageContent || messageContent.trim() === '');
                                        if (!(wasEmpty && !wasEmptyInterrupt)) return [3 /*break*/, 5];
                                        state.empty_response_count++;
                                        console.warn("[ANTI-HALLUCINATION] Empty/short response detected " +
                                            "(count: ".concat(state.empty_response_count, "). Content: \"").concat(messageContent === null || messageContent === void 0 ? void 0 : messageContent.slice(0, 60), "\""));
                                        if (!(state.empty_response_count >= MAX_EMPTY_RESPONSES)) return [3 /*break*/, 4];
                                        console.error('[ANTI-HALLUCINATION] Max empty responses reached. Injecting recovery.');
                                        state.empty_response_count = 0;
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, session.say("I'm sorry, I seem to be having trouble. Could you please repeat that?", { allowInterruptions: true })];
                                    case 2:
                                        _a.sent();
                                        return [3 /*break*/, 4];
                                    case 3:
                                        e_4 = _a.sent();
                                        console.error('[ANTI-HALLUCINATION] Recovery say failed:', e_4);
                                        return [3 /*break*/, 4];
                                    case 4:
                                        // Restart silence timer without resetting count
                                        if (state.silence_count < 3) {
                                            silenceHandler.startWaiting();
                                        }
                                        return [2 /*return*/];
                                    case 5:
                                        // Reset empty counter on valid response
                                        state.empty_response_count = 0;
                                        state.last_valid_response_time = Date.now();
                                        if (wasEmptyInterrupt) {
                                            console.debug('[AGENT] Empty interrupt — stale VAD. Restarting silence timer.');
                                            if (state.silence_count < 3) {
                                                silenceHandler.startWaiting();
                                            }
                                            return [2 /*return*/];
                                        }
                                        // ── Restart silence timer ────────────────────────────────
                                        if (state.last_was_silence_message) {
                                            state.last_was_silence_message = false;
                                            console.debug('[SILENCE] Silence message delivered. Restarting timer.');
                                            silenceHandler.startWaiting();
                                        }
                                        else {
                                            console.debug('[SILENCE] Agent response complete. Resetting count and starting wait.');
                                            silenceHandler.resetAndStart(state);
                                        }
                                        return [2 /*return*/];
                                }
                            });
                        }); });
                    });
                    // Clean up on session close — set the guard flag FIRST so every pending
                    // async callback (SpeechCreated done, silence timeout) exits immediately.
                    session.on(agents_1.voice.AgentSessionEventTypes.Close, function () {
                        console.log('[AGENT] Session closed. Setting sessionClosed guard and stopping silence handler.');
                        state.sessionClosed = true;
                        silenceHandler.stop();
                    });
                    // Session-level errors
                    session.on('error', function (error) {
                        var _a, _b, _c, _d;
                        console.error('[SESSION] Session error:', (_a = error === null || error === void 0 ? void 0 : error.context) === null || _a === void 0 ? void 0 : _a.type, (_c = (_b = error === null || error === void 0 ? void 0 : error.context) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.name);
                        if (((_d = error === null || error === void 0 ? void 0 : error.context) === null || _d === void 0 ? void 0 : _d.type) === 'llm_error') {
                            console.error('[LLM] LLM error. Provider may be misconfigured or unreachable.');
                        }
                    });
                    // LLM errors (recoverable vs fatal)
                    session.on('llm_error', function (error) {
                        console.error('[AGENT] ❌ LLM error occurred:', error.message);
                        if (error.recoverable) {
                            try {
                                session.say("I'm having a little trouble right now. Give me just a moment.", { allowInterruptions: true });
                            }
                            catch (_e) { }
                        }
                        else {
                            console.error('[AGENT] 🛑 CRITICAL: Unrecoverable LLM error, ending session.');
                            try {
                                session.say("I'm sorry, I'm experiencing a technical issue and need to end our call. " +
                                    "Please try again shortly.", { allowInterruptions: false });
                            }
                            catch (_e) { }
                            setTimeout(function () { return ctx.room.disconnect(); }, 5000);
                        }
                    });
                    // ─────────────────────────────────────────────────────────────────────
                    // User Input Transcription Handler
                    // ─────────────────────────────────────────────────────────────────────
                    session.on(agents_1.voice.AgentSessionEventTypes.UserInputTranscribed, function (event) { return __awaiter(void 0, void 0, void 0, function () {
                        var transcript, confidence, durationMs, normalTimeout, goodbyeTriggers, tLower, isGoodbye, goodbyeMsg, result, phrase;
                        var _a, _b, _c, _d;
                        return __generator(this, function (_f) {
                            // Only process final (committed) transcripts
                            if (!event.isFinal)
                                return [2 /*return*/];
                            if (state.sessionClosed)
                                return [2 /*return*/]; // ← guard
                            state.last_user_utterance_time = Date.now();
                            transcript = (_a = event.transcript) !== null && _a !== void 0 ? _a : '';
                            confidence = 1.0;
                            durationMs = 2000;
                            // ── Anti-hallucination: detect repeated transcripts ───────────
                            if (transcript === state.last_transcript) {
                                state.same_transcript_count++;
                                if (state.same_transcript_count >= 3) {
                                    console.warn("[ANTI-HALLUCINATION] Transcript repeated ".concat(state.same_transcript_count, " times: ") +
                                        "\"".concat(transcript.slice(0, 60), "\". Possible VAD feedback loop."));
                                    // Do not forward to LLM — skip processing
                                    return [2 /*return*/];
                                }
                            }
                            else {
                                state.same_transcript_count = 0;
                                state.last_transcript = transcript;
                            }
                            // ── First utterance → switch to normal silence timeout ─────────
                            if (!state.conversation_started) {
                                state.conversation_started = true;
                                console.log('[AGENT] First user utterance received. Conversation started.');
                                normalTimeout = Math.max(((_b = config.vad) === null || _b === void 0 ? void 0 : _b.silence_timeout_ms) || 8000, 5000);
                                silenceHandler.setTimeoutDuration(normalTimeout);
                            }
                            console.debug('[SILENCE] User utterance committed. Waiting for agent response.');
                            goodbyeTriggers = config.goodbye_triggers || [
                                "goodbye", "bye", "that's all", "no thanks", "i'm good", "thank you",
                                "धन्यवाद", "बस", "ठीक है", "नमस्ते", "अलविदा",
                                "આભાર", "બસ", "ઠીક છે",
                            ];
                            tLower = transcript.toLowerCase();
                            isGoodbye = goodbyeTriggers.some(function (t) { return tLower.includes(t.toLowerCase()); });
                            if (isGoodbye) {
                                state.goodbye_delivered = true;
                                silenceHandler.stop();
                                goodbyeMsg = ((_d = (_c = config.silence_behavior) === null || _c === void 0 ? void 0 : _c.messages) === null || _d === void 0 ? void 0 : _d[2]) || "Thank you for your time. Have a great day!";
                                try {
                                    session.say(goodbyeMsg, { allowInterruptions: false });
                                }
                                catch (e) {
                                    console.error('[GOODBYE] Error during say:', e);
                                }
                                return [2 /*return*/];
                            }
                            result = validator.validate(transcript, confidence, durationMs);
                            if (!result.valid && result.reason) {
                                phrase = validator.getClarificationPhrase(result.reason);
                                console.log("[VALIDATOR] \u274C Invalid input (".concat(result.reason, "): \"").concat(transcript.slice(0, 60), "\""));
                                if (phrase) {
                                    try {
                                        session.say(phrase, { allowInterruptions: false });
                                    }
                                    catch (e) {
                                        console.error('[VALIDATOR] Failed to speak clarification phrase:', e);
                                    }
                                }
                                else {
                                    console.log("[VALIDATOR] Silent pass (".concat(result.reason, ") \u2014 staying in listening state."));
                                }
                                return [2 /*return*/];
                            }
                            if (result.valid) {
                                console.log("[VALIDATOR] \u2705 Valid input: \"".concat(transcript.slice(0, 60), "\""));
                            }
                            return [2 /*return*/];
                        });
                    }); });
                    // ─────────────────────────────────────────────────────────────────────
                    // Start Session
                    // ─────────────────────────────────────────────────────────────────────
                    return [4 /*yield*/, session.start({ agent: voiceAgent, room: ctx.room })];
                case 6:
                    // ─────────────────────────────────────────────────────────────────────
                    // Start Session
                    // ─────────────────────────────────────────────────────────────────────
                    _5.sent();
                    console.log('[AGENT] 🎙️  Agent is live and listening! (Deepgram VAD, no local Silero)');
                    console.log("[AGENT] Barge-in: ".concat((_4 = (_3 = config.vad) === null || _3 === void 0 ? void 0 : _3.barge_in) !== null && _4 !== void 0 ? _4 : true, ", min interruption: ").concat(bargeInMinMs, "ms"));
                    // ─────────────────────────────────────────────────────────────────────
                    // Participant joined → Greeting
                    // ─────────────────────────────────────────────────────────────────────
                    ctx.room.on('participantConnected', function (participant) { return __awaiter(void 0, void 0, void 0, function () {
                        var greetingPhrase, e_5;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (participant.identity === 'agent')
                                        return [2 /*return*/];
                                    console.log("[AGENT] Human participant joined: ".concat(participant.identity));
                                    silenceHandler.stop();
                                    // Brief delay so audio pipeline is ready
                                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 800); })];
                                case 1:
                                    // Brief delay so audio pipeline is ready
                                    _a.sent();
                                    greetingPhrase = "Hello, how can I help you today?";
                                    console.log('[AGENT] Delivering greeting...');
                                    _a.label = 2;
                                case 2:
                                    _a.trys.push([2, 4, , 5]);
                                    return [4 /*yield*/, session.say(greetingPhrase, { allowInterruptions: false })];
                                case 3:
                                    _a.sent();
                                    return [3 /*break*/, 5];
                                case 4:
                                    e_5 = _a.sent();
                                    console.error('[AGENT] Error during greeting say:', e_5);
                                    return [3 /*break*/, 5];
                                case 5:
                                    state.greeting_delivered = true;
                                    // Silence timer starts when SpeechCreated → done callback fires
                                    console.log('[AGENT] Greeting complete. Silence timer will start via SpeechCreated callback.');
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    // ─────────────────────────────────────────────────────────────────────
                    // Shutdown callback
                    // ─────────────────────────────────────────────────────────────────────
                    ctx.addShutdownCallback(function () { return __awaiter(void 0, void 0, void 0, function () {
                        var duration;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    duration = Math.floor((Date.now() - startTime) / 1000);
                                    console.log("[AGENT] Session ended. Duration: ".concat(duration, "s"));
                                    state.sessionClosed = true; // ensure all callbacks stop immediately
                                    silenceHandler.stop();
                                    return [4 /*yield*/, saveTranscript({
                                            agent_id: agentId,
                                            user_id: userId,
                                            session_id: sessionId,
                                            duration_seconds: duration,
                                            transcript_json: [],
                                            metadata: { avg_latency: 0 },
                                        })];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    return [2 /*return*/];
            }
        });
    }); },
});
// ─── Worker startup ───────────────────────────────────────────────────────────
agents_1.cli.runApp(new agents_1.WorkerOptions({
    agent: __filename,
    initializeProcessTimeout: 60000, // 60 s — tsx startup is slow
    port: parseInt(process.env.PORT || '8081', 10),
    host: '0.0.0.0',
}));
