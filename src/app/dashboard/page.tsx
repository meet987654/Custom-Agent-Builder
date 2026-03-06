'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Download, MoreVertical, Copy, Play, Settings } from 'lucide-react';
import { DownloadCodeModal } from '@/components/DownloadCodeModal';
import SignOutButton from '@/components/SignOutButton';

export default function DashboardPage() {
    const router = useRouter();
    const [agents, setAgents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Create Config
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createAgentName, setCreateAgentName] = useState('');
    const [createClientName, setCreateClientName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Download Config
    const [downloadAgent, setDownloadAgent] = useState<{ id: string, name: string } | null>(null);

    useEffect(() => {
        async function fetchAgents() {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('agents')
                .select('*')
                .neq('is_template', true) // Filter out base template if visible to user
                .order('created_at', { ascending: false });

            if (data) setAgents(data);
            setLoading(false);
        }
        fetchAgents();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createAgentName || !createClientName) return;

        setIsCreating(true);
        try {
            const res = await fetch('/api/agents/clone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: createAgentName, clientName: createClientName }),
            });

            if (!res.ok) throw new Error('Failed to create agent');

            const { agentId, redirect: redirectUrl } = await res.json();
            router.push(redirectUrl);
        } catch (err: any) {
            alert(err.message);
            setIsCreating(false);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center bg-gray-950 text-white">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-950 px-8 py-12 text-white">
            <div className="mx-auto max-w-7xl">
                <header className="mb-12 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Voice Agents</h1>
                        <p className="mt-2 text-gray-400">Manage and deploy your AI voice workforce.</p>
                    </div>
                    <div className="flex items-center gap-6">
                        <SignOutButton />
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                        >
                            + Create New Agent
                        </button>
                    </div>
                </header>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {/* Agent Cards */}
                    {agents.map((agent) => (
                        <div key={agent.id} className="group relative flex flex-col justify-between rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-sm transition-all hover:border-gray-700 hover:shadow-xl">
                            <div>
                                <div className="mb-4 flex items-start justify-between">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                                        <Settings size={20} />
                                    </div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => setDownloadAgent({ id: agent.id, name: agent.name })}
                                            className="rounded p-2 text-gray-500 hover:bg-gray-800 hover:text-white"
                                            title="Download Code"
                                        >
                                            <Download size={18} />
                                        </button>
                                    </div>
                                </div>
                                <h3 className="mb-1 text-lg font-semibold text-white group-hover:text-indigo-400">{agent.name}</h3>
                                <p className="line-clamp-2 text-sm text-gray-400">{agent.description || 'No description provided.'}</p>
                            </div>

                            <div className="mt-6 flex flex-col gap-3">
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span>{agent.config?.language?.toUpperCase() || 'EN'}</span>
                                    <span>{new Date(agent.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <a
                                        href={`/agent/${agent.id}`}
                                        className="flex items-center justify-center rounded-lg border border-gray-700 bg-transparent py-2.5 text-sm font-medium text-gray-300 transition hover:border-gray-600 hover:bg-gray-800 hover:text-white"
                                    >
                                        Edit
                                    </a>
                                    <a
                                        href={`/agent/${agent.id}/test`}
                                        className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
                                    >
                                        <Play size={14} fill="currentColor" /> Test
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* New Agent Card */}
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-800 bg-gray-900/30 p-6 text-center transition hover:border-gray-700 hover:bg-gray-900"
                    >
                        <div className="mb-4 rounded-full bg-gray-800 p-4 text-gray-400">
                            <Copy size={24} />
                        </div>
                        <h3 className="text-lg font-medium text-white">Clone Template</h3>
                        <p className="mt-2 text-sm text-gray-500">Start from the optimized base model</p>
                    </button>
                </div>
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/60">
                    <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-2xl">
                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-white">Create New Agent</h2>
                            <p className="text-sm text-gray-400">Clone the base template to get started.</p>
                        </div>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-300">Client / Project</label>
                                <input
                                    type="text"
                                    required
                                    value={createClientName}
                                    onChange={(e) => setCreateClientName(e.target.value)}
                                    placeholder="e.g. Acme Corp"
                                    className="w-full rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-300">Agent Name</label>
                                <input
                                    type="text"
                                    required
                                    value={createAgentName}
                                    onChange={(e) => setCreateAgentName(e.target.value)}
                                    placeholder="e.g. Booking Assistant"
                                    className="w-full rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isCreating}
                                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                                >
                                    {isCreating ? 'Cloning...' : 'Create Agent'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Download Modal */}
            {downloadAgent && (
                <DownloadCodeModal
                    open={!!downloadAgent}
                    onOpenChange={(op) => !op && setDownloadAgent(null)}
                    agentId={downloadAgent.id}
                    agentName={downloadAgent.name}
                />
            )}
        </div>
    );
}
