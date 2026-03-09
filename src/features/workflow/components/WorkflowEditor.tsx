'use client';

import React, { useEffect, useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
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
        <div className="flex h-[800px] w-full rounded-lg border border-gray-800 bg-gray-950 overflow-hidden relative">
            <ReactFlowProvider>
                {/* Save Indicator */}
                <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
                    <div className="bg-gray-900/80 text-gray-400 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-800 shadow-md flex items-center gap-2 backdrop-blur-sm">
                        <span className="w-2 h-2 rounded-full bg-green-500/80 animate-pulse"></span>
                        Auto-saving active
                    </div>
                    <button
                        onClick={handleManualSync}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-md text-sm font-semibold transition-all shadow-lg flex items-center gap-2 border border-indigo-400/30"
                    >
                        {isSaving ? 'Syncing...' : 'Sync to Config & Save'}
                    </button>
                </div>

                {/* Left Toolbar / Node Palette */}
                <div className="w-64 border-r border-gray-800 bg-gray-900 flex flex-col shrink-0">
                    <Sidebar />
                </div>

                {/* Main Canvas Area */}
                <div className="flex-1 relative h-full">
                    <Canvas />
                </div>

                {/* Right Editor Panel */}
                <div className="w-80 border-l border-gray-800 bg-gray-900 flex flex-col shrink-0 overflow-y-auto">
                    <NodeEditorPanel />
                </div>
            </ReactFlowProvider>
        </div>
    );
}
