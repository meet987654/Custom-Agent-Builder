'use client';

import { useReducer, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Building2,
  Briefcase,
  MessageSquare,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Sparkles,
  X,
  Plus,
  AlertCircle,
} from 'lucide-react';

/* ──────────────────────────────────────────────
   TYPES
   ────────────────────────────────────────────── */

type Industry = 'Healthcare' | 'Real Estate' | 'E-commerce' | 'Finance' | 'Customer Support' | 'Education' | 'Legal' | 'Other';
type Language = 'English' | 'Hindi' | 'Gujarati' | 'Tamil' | 'Telugu' | 'Marathi' | 'Other';
type Gender = 'Male' | 'Female' | 'Neutral';
type UseCaseType = 'Appointment Booking' | 'Lead Qualification' | 'Customer Support' | 'Survey' | 'Outbound Campaign' | 'Inbound Helpdesk' | 'Other';
type Tone = 'Formal' | 'Friendly' | 'Neutral';

interface BriefFormState {
  // Step 1
  business_name: string;
  industry: Industry | '';
  primary_language: Language | '';
  agent_gender: Gender | '';

  // Step 2
  use_case_type: UseCaseType | '';
  use_case_description: string;
  key_tasks: string[];

  // Step 3
  tone: Tone | '';
  strictness: number;
  handle_objections: boolean;
  forbidden_topics: string;
  contact_memory_enabled: boolean;
  contact_fields: string[];

  // Meta
  currentStep: number;
}

type BriefAction =
  | { type: 'SET_FIELD'; field: keyof Omit<BriefFormState, 'currentStep' | 'key_tasks' | 'contact_fields'>; value: string | number | boolean }
  | { type: 'SET_TASKS'; tasks: string[] }
  | { type: 'TOGGLE_CONTACT_FIELD'; field: string }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'GO_TO_STEP'; step: number };

const initialState: BriefFormState = {
  business_name: '',
  industry: '',
  primary_language: '',
  agent_gender: '',
  use_case_type: '',
  use_case_description: '',
  key_tasks: [],
  tone: '',
  strictness: 3,
  handle_objections: false,
  forbidden_topics: '',
  contact_memory_enabled: true,
  contact_fields: ['Name', 'Phone'],
  currentStep: 0,
};

function briefReducer(state: BriefFormState, action: BriefAction): BriefFormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_TASKS':
      return { ...state, key_tasks: action.tasks };
    case 'TOGGLE_CONTACT_FIELD':
      if (['Name', 'Phone'].includes(action.field)) return state; // locked
      return {
        ...state,
        contact_fields: state.contact_fields.includes(action.field)
          ? state.contact_fields.filter(f => f !== action.field)
          : [...state.contact_fields, action.field]
      };
    case 'NEXT_STEP':
      return { ...state, currentStep: Math.min(state.currentStep + 1, 3) };
    case 'PREV_STEP':
      return { ...state, currentStep: Math.max(state.currentStep - 1, 0) };
    case 'GO_TO_STEP':
      return { ...state, currentStep: action.step };
    default:
      return state;
  }
}

/* ──────────────────────────────────────────────
   CONSTANTS
   ────────────────────────────────────────────── */

const INDUSTRIES: Industry[] = ['Healthcare', 'Real Estate', 'E-commerce', 'Finance', 'Customer Support', 'Education', 'Legal', 'Other'];
const LANGUAGES: Language[] = ['English', 'Hindi', 'Gujarati', 'Tamil', 'Telugu', 'Marathi', 'Other'];
const GENDERS: Gender[] = ['Male', 'Female', 'Neutral'];
const USE_CASES: UseCaseType[] = ['Appointment Booking', 'Lead Qualification', 'Customer Support', 'Survey', 'Outbound Campaign', 'Inbound Helpdesk', 'Other'];
const TONES: Tone[] = ['Formal', 'Friendly', 'Neutral'];

const STEPS = [
  { label: 'Business', icon: Building2 },
  { label: 'Use Case', icon: Briefcase },
  { label: 'Behavior', icon: MessageSquare },
  { label: 'Confirm', icon: CheckCircle2 },
];

const STRICTNESS_LABELS = ['Very Flexible', 'Flexible', 'Balanced', 'Strict', 'Very Strict'];

/* ──────────────────────────────────────────────
   MAIN COMPONENT
   ────────────────────────────────────────────── */

export default function ClientBriefPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(briefReducer, initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskInput, setTaskInput] = useState('');

  // ────── validation ──────
  const validateStep = useCallback((step: number): string | null => {
    switch (step) {
      case 0:
        if (!state.business_name.trim()) return 'Business name is required';
        if (!state.industry) return 'Please select an industry';
        if (!state.primary_language) return 'Please select a language';
        if (!state.agent_gender) return 'Please select agent gender';
        return null;
      case 1:
        if (!state.use_case_type) return 'Please select a use case type';
        if (!state.use_case_description.trim()) return 'Description is required';
        if (state.use_case_description.length > 500) return 'Description must be under 500 characters';
        if (state.key_tasks.length === 0) return 'Minimum 1 key task required';
        return null;
      case 2:
        if (!state.tone) return 'Please select a tone';
        return null;
      default:
        return null;
    }
  }, [state]);

  const handleNext = () => {
    const validationError = validateStep(state.currentStep);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    dispatch({ type: 'NEXT_STEP' });
  };

  const handlePrev = () => {
    setError(null);
    dispatch({ type: 'PREV_STEP' });
  };

  const addTask = () => {
    const trimmed = taskInput.trim();
    if (!trimmed) return;
    if (state.key_tasks.length >= 5) {
      setError('Maximum 5 tasks allowed');
      return;
    }
    if (state.key_tasks.includes(trimmed)) {
      setError('Task already added');
      return;
    }
    dispatch({ type: 'SET_TASKS', tasks: [...state.key_tasks, trimmed] });
    setTaskInput('');
    setError(null);
  };

  const removeTask = (index: number) => {
    dispatch({ type: 'SET_TASKS', tasks: state.key_tasks.filter((_, i) => i !== index) });
  };

  const handleTaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTask();
    }
  };

  // ────── submission ──────
  const handleSubmit = async () => {
    // Final validation of all steps
    for (let i = 0; i < 3; i++) {
      const err = validateStep(i);
      if (err) {
        dispatch({ type: 'GO_TO_STEP', step: i });
        setError(err);
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: state.business_name.trim(),
          industry: state.industry,
          primary_language: state.primary_language,
          agent_gender: state.agent_gender,
          use_case_type: state.use_case_type,
          use_case_description: state.use_case_description.trim(),
          key_tasks: state.key_tasks,
          tone: state.tone,
          strictness_level: state.strictness,
          handle_objections: state.handle_objections,
          forbidden_topics: state.forbidden_topics.trim() || null,
          contact_memory_enabled: state.contact_memory_enabled,
          contact_fields: state.contact_fields,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create agent');
      }

      toast.success('Your agent skeleton is ready!', {
        duration: 4000,
        icon: '🎉',
        style: {
          background: '#1e1b4b',
          color: '#e0e7ff',
          border: '1px solid #4338ca',
        },
      });

      router.push('/dashboard');

    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setIsSubmitting(false);
    }
  };

  // ────── render helpers ──────
  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-1 mb-10">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isActive = idx === state.currentStep;
        const isCompleted = idx < state.currentStep;

        return (
          <div key={step.label} className="flex items-center">
            <button
              onClick={() => {
                // Only allow going back to completed steps
                if (idx < state.currentStep) {
                  setError(null);
                  dispatch({ type: 'GO_TO_STEP', step: idx });
                }
              }}
              className={`
                flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium
                transition-all duration-300 cursor-pointer
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-105'
                  : isCompleted
                    ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800/50'
                    : 'bg-gray-800/50 text-gray-500'
                }
              `}
              disabled={idx > state.currentStep}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {idx < STEPS.length - 1 && (
              <div className={`mx-1 h-px w-6 sm:w-10 transition-colors duration-300 ${
                idx < state.currentStep ? 'bg-indigo-500' : 'bg-gray-700'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );

  /* ────────────────────────────────────────────
     STEP 1: Business Identity
     ──────────────────────────────────────────── */
  const renderStep1 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-white tracking-tight">Business Identity</h2>
        <p className="mt-1 text-sm text-gray-400">Tell us about your business so we can tailor the agent.</p>
      </div>

      {/* Business Name */}
      <div>
        <label htmlFor="business_name" className="mb-1.5 block text-sm font-medium text-gray-300">
          Business Name <span className="text-red-400">*</span>
        </label>
        <input
          id="business_name"
          type="text"
          value={state.business_name}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'business_name', value: e.target.value })}
          placeholder="e.g. Sunrise Health Clinic"
          className="w-full rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3 text-white
                     placeholder-gray-500 backdrop-blur-sm transition-all
                     focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {/* Industry */}
      <div>
        <label htmlFor="industry" className="mb-1.5 block text-sm font-medium text-gray-300">
          Industry <span className="text-red-400">*</span>
        </label>
        <select
          id="industry"
          value={state.industry}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'industry', value: e.target.value })}
          className="w-full rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3 text-white
                     transition-all appearance-none
                     focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="" className="bg-gray-900">Select industry…</option>
          {INDUSTRIES.map((ind) => (
            <option key={ind} value={ind} className="bg-gray-900">{ind}</option>
          ))}
        </select>
      </div>

      {/* Primary Language */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Primary Language <span className="text-red-400">*</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => dispatch({ type: 'SET_FIELD', field: 'primary_language', value: lang })}
              className={`rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200
                ${state.primary_language === lang
                  ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 shadow-md shadow-indigo-500/10'
                  : 'border-gray-700 bg-gray-800/40 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }
              `}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Gender */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Agent Voice Gender <span className="text-red-400">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => dispatch({ type: 'SET_FIELD', field: 'agent_gender', value: g })}
              className={`rounded-xl border px-6 py-4 text-sm font-medium transition-all duration-200
                ${state.agent_gender === g
                  ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 shadow-md shadow-indigo-500/10'
                  : 'border-gray-700 bg-gray-800/40 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }
              `}
            >
              {g === 'Male' ? '🧑‍💼' : g === 'Female' ? '👩‍💼' : '🤖'} {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ────────────────────────────────────────────
     STEP 2: Use Case
     ──────────────────────────────────────────── */
  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-white tracking-tight">Use Case</h2>
        <p className="mt-1 text-sm text-gray-400">Define what your agent will do and the tasks it handles.</p>
      </div>

      {/* Use Case Type */}
      <div>
        <label htmlFor="use_case_type" className="mb-1.5 block text-sm font-medium text-gray-300">
          Use Case Type <span className="text-red-400">*</span>
        </label>
        <select
          id="use_case_type"
          value={state.use_case_type}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'use_case_type', value: e.target.value })}
          className="w-full rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3 text-white
                     transition-all appearance-none
                     focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <option value="" className="bg-gray-900">Select use case…</option>
          {USE_CASES.map((uc) => (
            <option key={uc} value={uc} className="bg-gray-900">{uc}</option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="use_case_description" className="mb-1.5 block text-sm font-medium text-gray-300">
          What should your agent do? <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <textarea
            id="use_case_description"
            value={state.use_case_description}
            onChange={(e) => {
              if (e.target.value.length <= 500) {
                dispatch({ type: 'SET_FIELD', field: 'use_case_description', value: e.target.value });
              }
            }}
            placeholder="e.g. Book appointments for patients calling our clinic, collect their name, preferred date and doctor preference…"
            rows={4}
            className="w-full rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3 text-white
                       placeholder-gray-500 resize-none backdrop-blur-sm transition-all
                       focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <span className={`absolute bottom-3 right-3 text-xs ${
            state.use_case_description.length > 450 ? 'text-amber-400' : 'text-gray-500'
          }`}>
            {state.use_case_description.length}/500
          </span>
        </div>
      </div>

      {/* Key Tasks (Tag Input) */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Key Tasks <span className="text-gray-500">(up to 5)</span>
        </label>

        {/* Tag Display */}
        {state.key_tasks.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {state.key_tasks.map((task, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30
                           px-3 py-1.5 text-sm text-indigo-300"
              >
                {task}
                <button
                  type="button"
                  onClick={() => removeTask(idx)}
                  className="rounded-full p-0.5 text-indigo-400 hover:bg-indigo-500/20 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Tag Input */}
        {state.key_tasks.length < 5 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={handleTaskKeyDown}
              placeholder="e.g. Collect patient name → press Enter"
              className="flex-1 rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3 text-white
                         placeholder-gray-500 transition-all
                         focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="button"
              onClick={addTask}
              className="flex items-center gap-1 rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3
                         text-sm font-medium text-gray-300 transition-all
                         hover:border-indigo-500 hover:text-indigo-300"
            >
              <Plus size={16} /> Add
            </button>
          </div>
        )}
      </div>

      {/* Memory */}
      <div className="pt-4 border-t border-gray-800">
        <div className="mb-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="block text-sm font-medium text-gray-300">Remember returning callers?</span>
              <span className="text-xs text-gray-500 mt-0.5 max-w-[250px] sm:max-w-xs block">Agent will greet returning callers by name and skip re-registration</span>
            </div>
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${state.contact_memory_enabled ? 'bg-indigo-600' : 'bg-gray-700'}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={state.contact_memory_enabled}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'contact_memory_enabled', value: e.target.checked })}
              />
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${state.contact_memory_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
          </label>
        </div>

        {state.contact_memory_enabled && (
          <div className="rounded-xl bg-gray-800/30 p-4 border border-gray-700/50">
            <label className="mb-3 block text-sm font-medium text-gray-300">What to remember</label>
            <div className="grid grid-cols-2 gap-3">
              {['Name', 'Phone', 'Email', 'Date of Birth', 'Previous answers', 'Custom field'].map(field => {
                const isLocked = ['Name', 'Phone'].includes(field);
                const isChecked = state.contact_fields.includes(field);
                return (
                  <label key={field} className={`flex items-center gap-2 text-sm ${isLocked ? 'text-gray-400 opacity-80 cursor-not-allowed' : 'text-gray-300 cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isLocked}
                      onChange={() => dispatch({ type: 'TOGGLE_CONTACT_FIELD', field })}
                      className="rounded border-gray-600 bg-gray-900 text-indigo-500 focus:ring-indigo-500/20"
                    />
                    {field} {isLocked && <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-300">Locked</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* ────────────────────────────────────────────
     STEP 3: Tone & Behavior
     ──────────────────────────────────────────── */
  const renderStep3 = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-white tracking-tight">Tone & Behavior</h2>
        <p className="mt-1 text-sm text-gray-400">Shape how your agent sounds and behaves in conversations.</p>
      </div>

      {/* Tone Selection */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Conversation Tone <span className="text-red-400">*</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          {TONES.map((t) => {
            const emoji = t === 'Formal' ? '👔' : t === 'Friendly' ? '😊' : '😐';
            return (
              <button
                key={t}
                type="button"
                onClick={() => dispatch({ type: 'SET_FIELD', field: 'tone', value: t })}
                className={`rounded-xl border px-4 py-4 text-center transition-all duration-200
                  ${state.tone === t
                    ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 shadow-md shadow-indigo-500/10'
                    : 'border-gray-700 bg-gray-800/40 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                  }
                `}
              >
                <div className="text-2xl mb-1">{emoji}</div>
                <div className="text-sm font-medium">{t}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Strictness Slider */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Topic Strictness
        </label>
        <p className="mb-3 text-xs text-gray-500">How tightly should the agent stay on topic?</p>
        <input
          type="range"
          min={1}
          max={5}
          value={state.strictness}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'strictness', value: parseInt(e.target.value) })}
          className="w-full h-2 rounded-full appearance-none cursor-pointer
                     bg-gray-700 accent-indigo-500
                     [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-lg
                     [&::-webkit-slider-thumb]:shadow-indigo-500/30"
        />
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          {STRICTNESS_LABELS.map((label, i) => (
            <span key={i} className={state.strictness === i + 1 ? 'text-indigo-400 font-medium' : ''}>
              {label}
            </span>
          ))}
        </div>
        <div className="mt-4 p-3 rounded-lg bg-gray-800/50 border border-gray-700 text-sm text-gray-300 flex items-start gap-2">
          <AlertCircle size={16} className="text-indigo-400 shrink-0 mt-0.5" />
          <span>
            {state.strictness === 1 && "Agent will easily chat about off-topic things, prioritizing fluid conversation."}
            {state.strictness === 2 && "Agent allows some small talk, but gently steers back to the main goal."}
            {state.strictness === 3 && "Agent is balanced; handles polite diversions but focuses primarily on required tasks."}
            {state.strictness === 4 && "Agent strictly follows the workflow, politely shutting down unrelated questions."}
            {state.strictness === 5 && "Agent refuses ANY topic outside the script. Highly rigid compliance."}
          </span>
        </div>
      </div>

      {/* Handle Objections Toggle */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Handle Objections?
        </label>
        <p className="mb-3 text-xs text-gray-500">Should the agent proactively address user concerns?</p>
        <div className="flex gap-3">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => dispatch({ type: 'SET_FIELD', field: 'handle_objections', value: val })}
              className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200
                ${state.handle_objections === val
                  ? val
                    ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                    : 'border-red-500/60 bg-red-600/10 text-red-300'
                  : 'border-gray-700 bg-gray-800/40 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }
              `}
            >
              {val ? '✅ Yes' : '❌ No'}
            </button>
          ))}
        </div>
      </div>

      {/* Forbidden Topics */}
      <div>
        <label htmlFor="forbidden_topics" className="mb-1.5 block text-sm font-medium text-gray-300">
          Forbidden Topics <span className="text-gray-500">(optional)</span>
        </label>
        <p className="mb-3 text-xs text-gray-500 flex flex-col gap-1">
          <span>Agent will refuse to discuss these topics and redirect the caller.</span>
        </p>
        <textarea
          id="forbidden_topics"
          value={state.forbidden_topics}
          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'forbidden_topics', value: e.target.value })}
          placeholder="e.g. pricing, competitor names, medical diagnoses — one per line or comma-separated"
          rows={3}
          className="w-full rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3 text-white
                     placeholder-gray-500 resize-none backdrop-blur-sm transition-all
                     focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>
    </div>
  );

  /* ────────────────────────────────────────────
     STEP 4: Confirmation Summary
     ──────────────────────────────────────────── */
  const renderStep4 = () => {
    const sections = [
      {
        title: 'Business Identity',
        icon: Building2,
        fields: [
          { label: 'Business Name', value: state.business_name },
          { label: 'Industry', value: state.industry },
          { label: 'Language', value: state.primary_language },
          { label: 'Agent Voice', value: state.agent_gender },
        ],
      },
      {
        title: 'Use Case',
        icon: Briefcase,
        fields: [
          { label: 'Type', value: state.use_case_type },
          { label: 'Description', value: state.use_case_description },
          { label: 'Key Tasks', value: state.key_tasks.length > 0 ? state.key_tasks.join(', ') : '—' },
          { label: 'Remember Callers', value: state.contact_memory_enabled ? `Yes (${state.contact_fields.join(', ')})` : 'No' },
        ],
      },
      {
        title: 'Tone & Behavior',
        icon: MessageSquare,
        fields: [
          { label: 'Tone', value: state.tone },
          { label: 'Strictness', value: `${state.strictness}/5 — ${STRICTNESS_LABELS[state.strictness - 1]}` },
          { label: 'Handle Objections', value: state.handle_objections ? 'Yes' : 'No' },
          { label: 'Forbidden Topics', value: state.forbidden_topics || '—' },
        ],
      },
    ];

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="mb-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">Review & Confirm</h2>
          <p className="mt-1 text-sm text-gray-400">Double-check everything before we build your agent.</p>
        </div>

        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div
              key={section.title}
              className="rounded-xl border border-gray-700/50 bg-gray-800/30 p-5 backdrop-blur-sm relative group"
            >
              <button 
                onClick={() => dispatch({ type: 'GO_TO_STEP', step: sections.indexOf(section) })}
                className="absolute top-4 right-4 text-xs font-medium text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Edit
              </button>
              <div className="mb-4 flex items-center gap-2 text-indigo-400">
                <Icon size={18} />
                <h3 className="text-sm font-semibold uppercase tracking-wider">{section.title}</h3>
              </div>
              <div className="space-y-3">
                {section.fields.map((field) => (
                  <div key={field.label} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-0">
                    <span className="text-sm text-gray-500 sm:w-40 shrink-0">{field.label}</span>
                    <span className="text-sm text-white break-words">{field.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ────────────────────────────────────────────
     MAIN RENDER
     ──────────────────────────────────────────── */
  const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Background gradient accent */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-600/10 px-4 py-1.5 text-sm text-indigo-300">
            <Sparkles size={14} />
            Agent Builder
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Create Your{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Voice Agent
            </span>
          </h1>
          <p className="mt-3 text-gray-400">
            Answer a few questions and we&apos;ll generate a ready-to-test agent.
          </p>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Form Card */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8 shadow-2xl shadow-black/20 backdrop-blur-sm">
          {/* Error Banner */}
          {error && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-600/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Current Step */}
          {stepRenderers[state.currentStep]()}

          {/* Navigation Buttons */}
          <div className="mt-8 flex items-center justify-between border-t border-gray-800 pt-6">
            {state.currentStep > 0 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="flex items-center gap-2 rounded-xl border border-gray-700 px-5 py-2.5
                           text-sm font-medium text-gray-300 transition-all
                           hover:border-gray-600 hover:bg-gray-800 hover:text-white"
              >
                <ChevronLeft size={16} /> Back
              </button>
            ) : (
              <div />
            )}

            {state.currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5
                           text-sm font-semibold text-white shadow-lg shadow-indigo-500/20
                           transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30"
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600
                           px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20
                           transition-all hover:from-indigo-500 hover:to-violet-500
                           hover:shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating Agent…
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Create My Agent
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Footer hint */}
        <p className="mt-6 text-center text-sm text-gray-500">
          You can upload documents and diagrams after creation
        </p>
      </div>
    </div>
  );
}
