'use client';

import { useState } from 'react';
import { Eye, EyeOff, Save, Check, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

import { useRouter } from 'next/navigation';

export function ApiKeyInput({
    provider,
    initialHasKey = false,
    label = 'API Key'
}: {
    provider: string;
    initialHasKey?: boolean;
    label?: string;
}) {
    const router = useRouter();
    const [hasKey, setHasKey] = useState(initialHasKey);
    const [isEditing, setIsEditing] = useState(!initialHasKey);
    const [key, setKey] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [error, setError] = useState('');
    const [showKey, setShowKey] = useState(false);

    // If already has key, show simplified view
    if (hasKey && !isEditing) {
        return (
            <div className="flex items-center justify-between rounded-md bg-gray-800 p-2 text-sm text-gray-300">
                <span className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Using saved {provider} key
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsEditing(true)}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                        Change key
                    </button>
                    <button
                        onClick={async () => {
                            if (!confirm('Are you sure you want to remove this API key?')) return;
                            try {
                                const res = await fetch('/api/keys', {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ provider }),
                                });
                                if (res.ok) {
                                    setHasKey(false);
                                    setIsEditing(true);
                                    setKey('');
                                    router.refresh();
                                }
                            } catch (e) { console.error(e); }
                        }}
                        className="text-xs text-red-500 hover:text-red-400"
                    >
                        Remove
                    </button>
                </div>
            </div>
        );
    }

    const handleSave = async () => {
        if (!key || key.length < 5) {
            setError('Key is too short');
            return;
        }
        setIsSaving(true);
        setError('');

        try {
            // Call API route
            // We are calling our internal Next.js API route that handles encryption and DB upsert
            const res = await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, key }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to save');
            }

            setHasKey(true);
            setIsEditing(false);
            setIsSaved(true);
            router.refresh();
            setTimeout(() => setIsSaved(false), 2000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-2">
            <div className="relative">
                <label className="text-xs font-medium text-gray-400">{label}</label>
                <div className="relative mt-1">
                    <input
                        type={showKey ? 'text' : 'password'}
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder={`Paste your ${provider} API key`}
                        className="block w-full rounded-md border border-gray-600 bg-gray-900 pr-10 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-300"
                    >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2">
                {hasKey && (
                    <button
                        onClick={() => setIsEditing(false)}
                        className="rounded px-2 py-1 text-xs text-gray-400 hover:text-gray-300"
                    >
                        Cancel
                    </button>
                )}
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Key'}
                </button>
            </div>
        </div>
    );
}
