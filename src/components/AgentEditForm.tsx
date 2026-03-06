'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useState, useEffect } from 'react';
import { ApiKeyInput } from '@/components/ApiKeyInput';
import {
    ChevronDown, MessageSquare, Mic, Volume2, Save, Play, RefreshCcw, Lock, X, Download, ArrowLeft
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DownloadCodeModal } from '@/components/DownloadCodeModal';
import { VALID_MODELS, DEFAULT_MODEL } from '@/lib/constants/providers';

const stepSchema = z.object({
    name: z.string().min(1, 'Name required'),
    description: z.string().min(1, 'Description required'),
    prompt_addition: z.string().optional(),
});

const toolSchema = z.object({
    name: z.string().min(1, 'Name required'),
    description: z.string().min(1, 'Description required'),
    parameters: z.record(z.string(), z.any()),
});

const formSchema = z.object({
    name: z.string().min(3),
    description: z.string().optional(),
    config: z.object({
        language: z.string(),
        stt: z.object({
            provider: z.string(),
            model: z.string(),
            options: z.record(z.string(), z.any()).optional(),
        }),
        llm: z.object({
            provider: z.string(),
            model: z.string(),
            options: z.record(z.string(), z.any()).optional(),
        }),
        tts: z.object({
            provider: z.string(),
            model: z.string(),
            voice: z.string(),
            speed: z.string().optional(),
        }),
        vad: z.object({
            provider: z.string(),
            threshold: z.number(),
            barge_in: z.boolean(),
            silence_timeout_ms: z.number(),
        }),
        voice_gender: z.string().optional(),
        system_prompt: z.string(),
        workflow_steps: z.array(stepSchema),
        tools: z.array(toolSchema),
        silence_behavior: z.object({
            messages: z.array(z.string()),
        }),
    }),
});

type FormValues = z.infer<typeof formSchema>;

export default function AgentEditForm({ agent, configuredProviders }: { agent: any, configuredProviders: string[] }) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [localConfiguredProviders, setLocalConfiguredProviders] = useState<string[]>(configuredProviders);

    useEffect(() => {
        setLocalConfiguredProviders(configuredProviders);
    }, [configuredProviders]);
    const [showDownloadModal, setShowDownloadModal] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: agent.name || '',
            description: agent.description || '',
            config: agent.config,
        },
    });

    const { register, control, handleSubmit, watch, setValue, formState: { errors } } = form;
    const { fields, append, remove } = useFieldArray({
        control,
        name: 'config.workflow_steps',
    });

    const language = watch('config.language');

    useEffect(() => {
        if (!language) return;
        if (language === 'gu') {
            setValue('config.stt.options.language', 'gu');
            const prompt = form.getValues('config.system_prompt');
            if (!prompt.includes('Gujarati')) {
                setValue('config.system_prompt', prompt + '\n\nRespond in Gujarati. If the user speaks in English, gently continue in Gujarati unless they insist.');
            }
        }
    }, [language, setValue, form]);

    const onSubmit = async (data: FormValues) => {
        const provider = data.config.llm.provider;
        const model = data.config.llm.model;
        const validModels = VALID_MODELS[provider] ?? [];

        if (validModels.length > 0 && !validModels.includes(model)) {
            alert(
                `"${model}" is not a valid model for ${provider}. ` +
                `Please select a valid model before saving.`
            );
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch(`/api/agents/${agent.id}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' },
            });

            if (!res.ok) throw new Error('Failed to save');
            router.refresh();
        } catch (err) {
            console.error(err);
            alert('Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    };

    const sttProvider = watch('config.stt.provider');
    const llmProvider = watch('config.llm.provider');
    const ttsProvider = watch('config.tts.provider');

    // Reset model when provider changes
    useEffect(() => {
        const currentModel = form.getValues('config.llm.model');
        const validModels = VALID_MODELS[llmProvider] || [];

        if (validModels.length > 0 && !validModels.includes(currentModel)) {
            setValue('config.llm.model', DEFAULT_MODEL[llmProvider] || '');
        }
    }, [llmProvider, setValue, form]);

    const ttsVoice = watch('config.tts.voice');

    // Reset TTS model and voice to provider-correct defaults when provider changes.
    // Without this, Cartesia model names like 'sonic-english' persist in the DB
    // when switching to ElevenLabs, causing APIConnectionError / silent audio.
    useEffect(() => {
        const ttsModelDefaults: Record<string, string> = {
            cartesia: 'sonic-english',
            elevenlabs: 'eleven_turbo_v2_5',
            openai: 'tts-1',
        };
        const ttsVoiceDefaults: Record<string, string> = {
            cartesia: '794f9389-aac1-45b6-b726-9d9369183238',
            elevenlabs: '21m00Tcm4TlvDq8ikWAM',
            openai: 'alloy',
        };
        setValue('config.tts.model', ttsModelDefaults[ttsProvider] ?? '');
        setValue('config.tts.voice', ttsVoiceDefaults[ttsProvider] ?? '');
    }, [ttsProvider, setValue]);

    // Auto-set voice gender based on voice
    useEffect(() => {
        if (!ttsVoice) return;
        const femaleVoices = [
            '79a125e8-cd45-4c13-8a67-188112f4dd22', // British Lady
            'b7d50908-b17c-442d-ad8d-810c63997ed9', // California Girl
            'nova', 'shimmer', // OpenAI
            '21m00Tcm4TlvDq8ikWAM', 'AZnzlk1XvdvUeBnXmlld' // ElevenLabs Rachel, Domi
        ];
        const maleVoices = [
            'a0e99841-438c-4a64-b679-ae501e7d6091', // Barbershop Man
            '5c42302c-194b-4d0c-ba1a-8cb485c84ab9', // Reading Man
            '794f9389-aac1-45b6-b726-9d9369183238', // Newsman
            'echo', 'onyx' // OpenAI
        ];

        let inferredGender = 'neutral';
        if (femaleVoices.includes(ttsVoice)) {
            inferredGender = 'female';
        } else if (maleVoices.includes(ttsVoice)) {
            inferredGender = 'male';
        }

        const currentValue = form.getValues('config.voice_gender');
        if (currentValue !== inferredGender) {
            setValue('config.voice_gender', inferredGender, { shouldDirty: true });
        }
    }, [ttsVoice, setValue, form]);

    return (
        <>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 pb-20">
                {/* Sticky Header */}
                <div className="sticky top-0 z-10 -mx-8 -mt-8 mb-8 flex items-center justify-between border-b border-gray-800 bg-gray-950/90 px-8 py-4 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => router.push('/dashboard')}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-gray-400 transition hover:bg-gray-800 hover:text-white"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div>
                            <input
                                {...register('name')}
                                className="bg-transparent text-xl font-bold text-white focus:outline-none"
                            />
                            {errors.name && <span className="block text-xs text-red-500">{errors.name.message}</span>}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setShowDownloadModal(true)}
                            className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
                        >
                            <Download size={16} />
                            Download Code
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push(`/agent/${agent.id}/test`)}
                            className="flex items-center gap-2 rounded bg-green-600/20 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-600/30"
                        >
                            <Play size={16} fill="currentColor" />
                            Test Agent
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex items-center gap-2 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            <Save size={16} />
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>

                {/* Main Content Layout */}
                <div className="grid gap-8 lg:grid-cols-3">
                    {/* Left Column (Main Config) */}
                    <div className="space-y-8 lg:col-span-2">

                        {/* Identity & Language */}
                        <div className="rounded-lg bg-gray-900 p-6">
                            <h2 className="mb-4 text-lg font-semibold text-white">Agent Setup</h2>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-400">Description</label>
                                    <input {...register('description')} className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-400">Language</label>
                                    <select {...register('config.language')} className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white">
                                        <option value="en">English (Default)</option>
                                        <option value="hi">Hindi</option>
                                        <option value="gu">Gujarati</option>
                                        <option value="es">Spanish</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* System Prompt */}
                        <div className="rounded-lg bg-gray-900 p-6">
                            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                                <MessageSquare size={18} /> Conversation Prompt
                            </h2>
                            <textarea
                                {...register('config.system_prompt')}
                                rows={10}
                                className="w-full rounded border border-gray-700 bg-gray-800 p-4 text-sm font-mono text-gray-300 focus:border-indigo-500 focus:outline-none"
                            />

                            <div className="mt-4 rounded border border-gray-700 bg-gray-950 p-4">
                                <details>
                                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-gray-500">
                                        Behavior Rules (Always Active)
                                    </summary>
                                    <ul className="mt-2 list-decimal space-y-1 pl-4 text-xs text-gray-400">
                                        <li>Only state facts explicitly given in prompt or by user.</li>
                                        <li>If unsure, say "I don't have that information".</li>
                                        <li>Only confirm actions after success.</li>
                                        <li>Ask clarifying questions for ambiguous input.</li>
                                        <li>Keep responses to 1-3 sentences.</li>
                                    </ul>
                                </details>
                            </div>
                        </div>

                        {/* Workflow Steps */}
                        <div className="rounded-lg bg-gray-900 p-6">
                            <h2 className="mb-4 text-lg font-semibold text-white">Workflow Steps</h2>
                            <div className="space-y-4">
                                {fields.map((field, index) => (
                                    <div key={field.id} className="relative rounded-md border border-gray-800 bg-gray-950 p-4 transition-colors hover:border-gray-700">
                                        <div className="mb-2 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-900/50 text-xs font-bold text-indigo-400">
                                                    {index + 1}
                                                </span>
                                                <h3 className="text-sm font-medium text-white">Step {index + 1}</h3>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => remove(index)}
                                                className="rounded p-1 text-gray-500 hover:bg-red-900/20 hover:text-red-400"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>

                                        <div className="space-y-3 pl-8">
                                            <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
                                                <input
                                                    {...register(`config.workflow_steps.${index}.name`)}
                                                    placeholder="e.g. Greeting"
                                                    className="w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                                                />
                                                {errors.config?.workflow_steps?.[index]?.name && (
                                                    <p className="mt-1 text-xs text-red-500">{errors.config.workflow_steps[index]?.name?.message}</p>
                                                )}
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>
                                                <textarea
                                                    {...register(`config.workflow_steps.${index}.description`)}
                                                    placeholder="Describe what the agent should do in this step..."
                                                    rows={2}
                                                    className="w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                                                />
                                                {errors.config?.workflow_steps?.[index]?.description && (
                                                    <p className="mt-1 text-xs text-red-500">{errors.config.workflow_steps[index]?.description?.message}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <button
                                    type="button"
                                    onClick={() => append({ name: '', description: '', prompt_addition: '' })}
                                    className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-gray-700 bg-gray-900/50 py-3 text-sm font-medium text-gray-400 transition-colors hover:border-gray-600 hover:bg-gray-800 hover:text-white"
                                >
                                    <span>+ Add Workflow Step</span>
                                </button>
                            </div>
                        </div>

                    </div>

                    {/* Right Column (Providers & Config) */}
                    <div className="space-y-8">

                        {/* STT/LLM/TTS Providers */}
                        <div className="rounded-lg bg-gray-900 p-6">
                            <h2 className="mb-4 text-lg font-semibold text-white">Voice & Intelligence</h2>

                            {/* STT */}
                            <div className="mb-6">
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2"><Mic size={14} /> STT Provider</label>
                                </div>
                                <select {...register('config.stt.provider')} className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white">
                                    <option value="deepgram">Deepgram</option>
                                    <option value="assemblyai">AssemblyAI</option>
                                </select>
                                <select {...register('config.stt.model')} className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white">
                                    {sttProvider === 'deepgram' && (<>
                                        <option value="nova-3">Nova-3 (Latest, Best)</option>
                                        <option value="nova-2">Nova-2</option>
                                        <option value="nova-2-general">Nova-2 General</option>
                                    </>)}
                                    {sttProvider === 'assemblyai' && (<>
                                        <option value="best">Best</option>
                                        <option value="nano">Nano (Fast)</option>
                                    </>)}
                                </select>
                                <ApiKeyInput
                                    key={`stt-${sttProvider}`}
                                    provider={sttProvider}
                                    initialHasKey={localConfiguredProviders.includes(sttProvider)}
                                />
                            </div>

                            {/* LLM */}
                            <div className="mb-6">
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2"><RefreshCcw size={14} /> LLM Provider</label>
                                </div>
                                <select {...register('config.llm.provider')} className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white">
                                    <option value="groq">Groq (Fastest)</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="gemini">Google Gemini</option>
                                </select>
                                <select {...register('config.llm.model')} className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white">
                                    {llmProvider === 'groq' && (<>
                                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Best)</option>
                                        <option value="llama-3.1-8b-instant">Llama 3.1 8B (Fastest)</option>
                                        <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                                        <option value="gemma2-9b-it">Gemma 2 9B</option>
                                    </>)}
                                    {llmProvider === 'openai' && (<>
                                        <option value="gpt-4o-mini">GPT-4o Mini (Fast)</option>
                                        <option value="gpt-4o">GPT-4o</option>
                                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                    </>)}
                                    {llmProvider === 'gemini' && (<>
                                        <option value="gemini-2.0-flash-001">Gemini 2.0 Flash (Best)</option>
                                        <option value="gemini-2.5-flash-preview-04-17">Gemini 2.5 Flash Preview</option>
                                        <option value="gemini-2.5-pro-preview-05-06">Gemini 2.5 Pro Preview</option>
                                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                    </>)}
                                </select>
                                <ApiKeyInput
                                    key={`llm-${llmProvider}`}
                                    provider={llmProvider}
                                    initialHasKey={localConfiguredProviders.includes(llmProvider)}
                                />
                            </div>

                            {/* TTS */}
                            <div className="mb-6">
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2"><Volume2 size={14} /> TTS Provider</label>
                                </div>
                                <select {...register('config.tts.provider')} className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white">
                                    <option value="cartesia">Cartesia</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="elevenlabs">ElevenLabs</option>
                                </select>
                                <select {...register('config.tts.voice')} className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white">
                                    {ttsProvider === 'cartesia' && (<>
                                        <option value="79a125e8-cd45-4c13-8a67-188112f4dd22">British Lady</option>
                                        <option value="a0e99841-438c-4a64-b679-ae501e7d6091">Barbershop Man</option>
                                        <option value="b7d50908-b17c-442d-ad8d-810c63997ed9">California Girl</option>
                                        <option value="5c42302c-194b-4d0c-ba1a-8cb485c84ab9">Reading Man</option>
                                        <option value="794f9389-aac1-45b6-b726-9d9369183238">Newsman (Default)</option>
                                    </>)}
                                    {ttsProvider === 'openai' && (<>
                                        <option value="alloy">Alloy</option>
                                        <option value="echo">Echo</option>
                                        <option value="fable">Fable</option>
                                        <option value="onyx">Onyx</option>
                                        <option value="nova">Nova</option>
                                        <option value="shimmer">Shimmer</option>
                                    </>)}
                                    {ttsProvider === 'elevenlabs' && (<>
                                        <option value="21m00Tcm4TlvDq8ikWAM">Rachel</option>
                                        <option value="AZnzlk1XvdvUeBnXmlld">Domi</option>
                                        <option value="EXAVITQu4vr4xnSDxMaL">Bella</option>
                                        <option value="ErXwobaYiN019PkySvjV">Antoni</option>
                                    </>)}
                                </select>

                                <div className="mt-4 mb-2">
                                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2 mb-2">
                                        Agent Gender <span className="text-xs text-gray-500 font-normal">(affects grammar in Hindi, Gujarati, etc.)</span>
                                    </label>
                                    <select {...register('config.voice_gender')} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white">
                                        <option value="neutral">Neutral (Default)</option>
                                        <option value="female">Female</option>
                                        <option value="male">Male</option>
                                    </select>
                                </div>
                                <ApiKeyInput
                                    key={`tts-${ttsProvider}`}
                                    provider={ttsProvider}
                                    initialHasKey={localConfiguredProviders.includes(ttsProvider)}
                                />
                            </div>

                        </div>

                        {/* Silence & VAD */}
                        <div className="rounded-lg bg-gray-900 p-6">
                            <h2 className="mb-4 text-lg font-semibold text-white">Silence & VAD</h2>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm text-gray-400">Barge-in (Interrupt)</label>
                                    <input type="checkbox" {...register('config.vad.barge_in')} />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400">Silence Timeout (ms)</label>
                                    <input
                                        type="number"
                                        {...register('config.vad.silence_timeout_ms', { valueAsNumber: true })}
                                        className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white"
                                    />
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </form>

            {/* Download Modal */}
            <DownloadCodeModal
                open={showDownloadModal}
                onOpenChange={setShowDownloadModal}
                agentId={agent.id}
                agentName={agent.name}
            />
        </>
    );
}
