"use strict";
/**
 * input-validator.ts
 * Pre-LLM utterance gate. Validates every user transcript before it is
 * forwarded to the language model. Filters noise, filler words, and
 * low-confidence captures. Rotates clarification phrases so the agent
 * never sounds robotic, and escalates after repeated failures.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputValidator = void 0;
// ─── Constants ────────────────────────────────────────────────────────────────
var FILLER_WORDS = new Set([
    'uh', 'um', 'hmm', 'hm', 'ah', 'er', 'uhh', 'umm', 'mmm', 'oh',
]);
var TOO_SHORT_PHRASES = [
    "Sorry, I didn't quite catch that. Could you say that again?",
    "I'm not sure I heard you fully. Could you repeat that?",
    "Pardon? I didn't quite get that.",
];
var LOW_CONFIDENCE_PHRASES = [
    "Sorry, I didn't quite get that. Could you say that a bit more clearly?",
    "I'm having a little trouble hearing you. Could you repeat that?",
    "Could you say that again? I want to make sure I understood correctly.",
];
var ESCALATION_PHRASE = "I'm really sorry, I'm having trouble understanding. Could you try speaking a little closer to your microphone?";
// ─── Session State ─────────────────────────────────────────────────────────────
var InputValidator = /** @class */ (function () {
    function InputValidator(opts) {
        var _a, _b, _c, _d, _e;
        this.counters = {
            empty: 0,
            filler_only: 0,
            too_short: 0,
            low_confidence: 0,
        };
        this.rotationIndex = {
            empty: 0,
            filler_only: 0,
            too_short: 0,
            low_confidence: 0,
        };
        this.totalConsecutiveInvalid = 0;
        this.minWordCount = (_a = opts === null || opts === void 0 ? void 0 : opts.minWordCount) !== null && _a !== void 0 ? _a : 2;
        this.minDurationMs = (_b = opts === null || opts === void 0 ? void 0 : opts.minDurationMs) !== null && _b !== void 0 ? _b : 1500;
        this.confidenceThreshold = (_c = opts === null || opts === void 0 ? void 0 : opts.confidenceThreshold) !== null && _c !== void 0 ? _c : 0.75;
        this.escalationThreshold = (_d = opts === null || opts === void 0 ? void 0 : opts.escalationThreshold) !== null && _d !== void 0 ? _d : 3;
        this.maxConsecutiveInvalid = (_e = opts === null || opts === void 0 ? void 0 : opts.maxConsecutiveInvalid) !== null && _e !== void 0 ? _e : 5;
    }
    // ─── Core Validation ──────────────────────────────────────────────────────
    InputValidator.prototype.validate = function (transcript, confidence, durationMs) {
        var _this = this;
        var trimmed = transcript.trim();
        // Condition 1 — Empty
        if (!trimmed) {
            return { valid: false, reason: 'empty' };
        }
        var words = trimmed.toLowerCase().split(/\s+/);
        // Condition 2 — Filler words only
        if (words.every(function (w) { return FILLER_WORDS.has(w); })) {
            return { valid: false, reason: 'filler_only' };
        }
        // Condition 3 — Too short
        var meaningfulWords = words.filter(function (w) { return !FILLER_WORDS.has(w); });
        if (meaningfulWords.length < this.minWordCount && durationMs < this.minDurationMs) {
            return { valid: false, reason: 'too_short' };
        }
        // Condition 4 — Low confidence
        if (confidence < this.confidenceThreshold) {
            return { valid: false, reason: 'low_confidence' };
        }
        // All checks passed — reset consecutive counter
        this.totalConsecutiveInvalid = 0;
        Object.keys(this.counters).forEach(function (k) {
            _this.counters[k] = 0;
        });
        return { valid: true };
    };
    // ─── Response Selection ───────────────────────────────────────────────────
    /**
     * Returns the clarification phrase to speak, or null if the agent should
     * stay silent (empty / filler_only) or fall through to silence handling
     * (too many consecutive invalids).
     */
    InputValidator.prototype.getClarificationPhrase = function (reason) {
        // Silent reasons — do not speak, just reset silence timer
        if (reason === 'empty' || reason === 'filler_only') {
            return null;
        }
        this.counters[reason]++;
        this.totalConsecutiveInvalid++;
        // Fall through to silence handling after max consecutive invalids
        if (this.totalConsecutiveInvalid >= this.maxConsecutiveInvalid) {
            return null;
        }
        // Escalate after threshold consecutive invalids of same type
        if (this.counters[reason] >= this.escalationThreshold) {
            return ESCALATION_PHRASE;
        }
        // Rotate through phrases for this reason
        var phrases = reason === 'too_short' ? TOO_SHORT_PHRASES : LOW_CONFIDENCE_PHRASES;
        var idx = this.rotationIndex[reason] % phrases.length;
        this.rotationIndex[reason]++;
        return phrases[idx];
    };
    /** Reset all session counters (call at session start). */
    InputValidator.prototype.reset = function () {
        var _this = this;
        this.totalConsecutiveInvalid = 0;
        Object.keys(this.counters).forEach(function (k) {
            _this.counters[k] = 0;
            _this.rotationIndex[k] = 0;
        });
    };
    return InputValidator;
}());
exports.InputValidator = InputValidator;
