export interface AgentConfig {
    name: string;
    description: string;
    config: {
        language: string;
        stt: {
            provider: string;
            model: string;
            options?: Record<string, any>;
        };
        llm: {
            provider: string;
            model: string;
            options?: Record<string, any>;
        };
        tts: {
            provider: string;
            model: string;
            voice: string;
            speed?: string;
        };
        vad: {
            provider: string;
            threshold: number;
            barge_in: boolean;
            silence_timeout_ms: number;
            // Section 15 additions
            min_speech_duration_ms?: number;
            min_silence_duration_ms?: number;
            speech_pad_ms?: number;
            barge_in_min_duration_ms?: number;
            noise_cancellation?: boolean;
        };
        system_prompt: string;
        workflow_steps: WorkflowStep[];
        silence_behavior: {
            messages: string[];
        };
        tools: ToolConfig[];
        // Section 15 additions
        input_validation?: {
            enabled: boolean;
            min_word_count: number;
            min_duration_ms: number;
            filler_words: string[];
            max_consecutive_invalid: number;
            escalation_threshold: number;
        };
    };
}

export interface WorkflowStep {
    name: string;
    description: string;
    prompt_addition: string;
}

export interface ToolConfig {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

export type FileMap = Record<string, string>;
