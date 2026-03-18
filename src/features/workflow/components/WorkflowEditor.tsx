'use client';

import React, { useEffect, useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Layout, FileText, Edit2, Eye, History, Save, Cloud, CheckCircle2, ChevronRight, User, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Canvas from './Canvas';
import Sidebar from './Sidebar';
import NodeEditorPanel from './NodeEditorPanel';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { WorkflowGraph } from '../schema/workflowSchema';

interface WorkflowEditorProps {
    agentId: string;
    initialSchema?: WorkflowGraph | null;
    onSyncSteps?: (nodes: any[]) => void;
}

export default function WorkflowEditor({ agentId, initialSchema, onSyncSteps }: WorkflowEditorProps) {
    const router = useRouter();
    const { nodes, edges, setGraph } = useWorkflowStore();
    const isFirstMount = useRef(true);
    const [isSaving, setIsSaving] = React.useState(false);

    // Initial Load
    useEffect(() => {
        if (initialSchema && initialSchema.nodes && initialSchema.edges) {
            setGraph(initialSchema.nodes as any, initialSchema.edges as any);
        }
    }, [initialSchema, setGraph]);

    // Auto-Save background tick
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }

        const timeout = setTimeout(async () => {
            const workflow_schema: WorkflowGraph = { nodes: nodes as any, edges: edges as any };
            try {
                await fetch(`/api/agents/${agentId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workflow_schema }),
                });
            } catch (err) {
                console.error('Failed to auto-save workflow', err);
            }
        }, 1500);

        return () => clearTimeout(timeout);
    }, [nodes, edges, agentId]);

    const handleManualSync = async () => {
        setIsSaving(true);
        if (onSyncSteps) {
            onSyncSteps(nodes);
        }
        setTimeout(() => setIsSaving(false), 1000);
    };

    return (
        <div className="flex flex-col h-screen w-screen bg-[#0a0c12] text-gray-400 overflow-hidden font-sans">
            <ReactFlowProvider>
                {/* --- HEADER --- */}
                <header className="h-14 border-b border-gray-800 bg-[#11141d] flex items-center justify-between px-6 shrink-0 z-20">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => router.push(`/agent/${agentId}`)}
                                className="p-2 -ml-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                                title="Back to Settings"
                            >
                                <ArrowLeft size={18} />
                            </button>
                            {/* Logo */}
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center shadow-[0_0_10px_rgba(37,99,235,0.4)]">
                                    <Layout size={16} className="text-white" />
                                </div>
                                <span className="text-white font-bold text-lg tracking-tight">Flow Designer</span>
                                <div className="h-4 w-[1px] bg-gray-800 mx-2"></div>
                                <span className="text-xs font-medium text-gray-500 bg-gray-800/40 px-2 py-0.5 rounded border border-gray-800/50 uppercase tracking-widest">v1.2</span>
                            </div>
                        </div>

                        {/* Menu Items */}
                        <nav className="hidden lg:flex items-center gap-5 text-[11px] font-bold uppercase tracking-widest">
                            <button className="text-white">File</button>
                            <button className="hover:text-white transition-colors">Edit</button>
                            <button className="hover:text-white transition-colors">View</button>
                            <button className="hover:text-white transition-colors">History</button>
                        </nav>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Status Badges */}
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-950/20 border border-green-900/40 text-[9px] font-bold text-green-500 uppercase tracking-widest">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                Connected
                            </div>
                            <div className="flex items-center gap-2 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                <Cloud size={14} className="text-gray-600" />
                                <span className="animate-pulse">Auto-saving</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="h-6 w-[1px] bg-gray-800 mx-2"></div>
                        <button
                            onClick={handleManualSync}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                        >
                            {isSaving ? 'Syncing...' : 'Sync & Save'}
                        </button>
                        <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden">
                            <User size={18} className="text-gray-500" />
                        </div>
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden">
                    {/* --- LEFT SIDEBAR (Nodes Palette) --- */}
                    <aside className="w-[300px] border-r border-gray-800 bg-[#11141d] flex flex-col shrink-0">
                        <Sidebar />
                    </aside>

                    {/* --- MAIN CANVAS --- */}
                    <main className="flex-1 relative bg-[#0a0c10]">
                        <Canvas />
                    </main>

                    {/* --- RIGHT SIDEBAR (Configuration) --- */}
                    <aside className="w-[340px] border-l border-gray-800 bg-[#11141d] flex flex-col shrink-0 overflow-y-auto z-10">
                        <NodeEditorPanel />
                    </aside>
                </div>

                {/* --- FOOTER STATUS BAR --- */}
                <footer className="h-8 border-t border-gray-800 bg-[#11141d] flex items-center px-4 shrink-0 text-[10px] text-gray-600">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={12} className="text-gray-500" />
                        Selection tip: Right-click on nodes for quick actions.
                    </div>
                </footer>
            </ReactFlowProvider>
        </div>
    );
}
