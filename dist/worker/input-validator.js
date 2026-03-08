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
const FILLER_WORDS = new Set([
    'uh', 'um', 'hmm', 'hm', 'ah', 'er', 'uhh', 'umm', 'mmm', 'oh',
]);
const TOO_SHORT_PHRASES = [
    "Sorry, I didn't quite catch that. Could you say that again?",
    "I'm not sure I heard you fully. Could you repeat that?",
    "Pardon? I didn't quite get that.",
];
const LOW_CONFIDENCE_PHRASES = [
    "Sorry, I didn't quite get that. Could you say that a bit more clearly?",
    "I'm having a little trouble hearing you. Could you repeat that?",
    "Could you say that again? I want to make sure I understood correctly.",
];
const ESCALATION_PHRASE = "I'm really sorry, I'm having trouble understanding. Could you try speaking a little closer to your microphone?";
// ─── Session State ─────────────────────────────────────────────────────────────
class InputValidator {
    counters = {
        empty: 0,
        filler_only: 0,
        too_short: 0,
        low_confidence: 0,
    };
    rotationIndex = {
        empty: 0,
        filler_only: 0,
        too_short: 0,
        low_confidence: 0,
    };
    totalConsecutiveInvalid = 0;
    /** Minimum word count (excluding fillers) to be considered a real utterance. */
    minWordCount;
    /** Minimum duration in ms for a short utterance to still be accepted. */
    minDurationMs;
    /** Minimum STT confidence score (0–1). */
    confidenceThreshold;
    /** Consecutive invalids before escalation phrase. */
    escalationThreshold;
    /** Consecutive invalids before falling through to silence handling. */
    maxConsecutiveInvalid;
    constructor(opts) {
        this.minWordCount = opts?.minWordCount ?? 2;
        this.minDurationMs = opts?.minDurationMs ?? 1500;
        this.confidenceThreshold = opts?.confidenceThreshold ?? 0.75;
        this.escalationThreshold = opts?.escalationThreshold ?? 3;
        this.maxConsecutiveInvalid = opts?.maxConsecutiveInvalid ?? 5;
    }
    // ─── Core Validation ──────────────────────────────────────────────────────
    validate(transcript, confidence, durationMs) {
        const trimmed = transcript.trim();
        // Condition 1 — Empty
        if (!trimmed) {
            return { valid: false, reason: 'empty' };
        }
        const words = trimmed.toLowerCase().split(/\s+/);
        // Condition 2 — Filler words only
        if (words.every(w => FILLER_WORDS.has(w))) {
            return { valid: false, reason: 'filler_only' };
        }
        // Condition 3 — Too short
        const meaningfulWords = words.filter(w => !FILLER_WORDS.has(w));
        if (meaningfulWords.length < this.minWordCount && durationMs < this.minDurationMs) {
            return { valid: false, reason: 'too_short' };
        }
        // Condition 4 — Low confidence
        if (confidence < this.confidenceThreshold) {
            return { valid: false, reason: 'low_confidence' };
        }
        // All checks passed — reset consecutive counter
        this.totalConsecutiveInvalid = 0;
        Object.keys(this.counters).forEach(k => {
            this.counters[k] = 0;
        });
        return { valid: true };
    }
    // ─── Response Selection ───────────────────────────────────────────────────
    /**
     * Returns the clarification phrase to speak, or null if the agent should
     * stay silent (empty / filler_only) or fall through to silence handling
     * (too many consecutive invalids).
     */
    getClarificationPhrase(reason) {
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
        const phrases = reason === 'too_short' ? TOO_SHORT_PHRASES : LOW_CONFIDENCE_PHRASES;
        const idx = this.rotationIndex[reason] % phrases.length;
        this.rotationIndex[reason]++;
        return phrases[idx];
    }
    /** Reset all session counters (call at session start). */
    reset() {
        this.totalConsecutiveInvalid = 0;
        Object.keys(this.counters).forEach(k => {
            this.counters[k] = 0;
            this.rotationIndex[k] = 0;
        });
    }
}
exports.InputValidator = InputValidator;
