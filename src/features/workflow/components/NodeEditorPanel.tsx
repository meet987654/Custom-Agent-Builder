'use client';

import React from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { Condition } from '../schema/workflowSchema';
import { Plus, X, ArrowRight } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function NodeEditorPanel() {
    const { nodes, edges, selectedNodeId, selectedEdgeId, updateNode, updateEdge } = useWorkflowStore();
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

    if (!selectedNode && !selectedEdge) {
        return (
            <div className="p-6 text-gray-400 text-sm flex h-full items-center justify-center text-center font-medium leading-relaxed">
                Select a node or connection line on the canvas to configure it here.
            </div>
        );
    }

    // --- EDGE EDITOR RENDER ---
    if (selectedEdge) {
        const isFallback = selectedEdge.data?.isFallback;
        const conditions: Condition[] = (selectedEdge.data?.conditions as Condition[]) || [];

        const handleEdgeChange = (dataToUpdate: any) => {
            updateEdge(selectedEdge.id, dataToUpdate);
        };

        const addCondition = () => {
            const newCondition: Condition = {
                id: uuidv4(),
                type: 'intent',
                operator: 'equals',
                value: ''
            };
            handleEdgeChange({ conditions: [...conditions, newCondition] });
        };

        const updateCondition = (condId: string, field: string, val: any) => {
            handleEdgeChange({
                conditions: conditions.map(c => c.id === condId ? { ...c, [field]: val } : c)
            });
        };

        const removeCondition = (condId: string) => {
            handleEdgeChange({
                conditions: conditions.filter(c => c.id !== condId)
            });
        };

        return (
            <aside className="h-full bg-gray-950 border-l border-gray-800 text-gray-300 w-80 flex flex-col shadow-2xl">
                <div className="p-4 border-b border-gray-800 shrink-0 bg-gray-900/50">
                    <h3 className="font-bold text-white uppercase tracking-wider text-sm flex items-center gap-2">
                        <ArrowRight size={16} className="text-cyan-500" />
                        Connection Edge
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">ID: {selectedEdge.id}</p>
                </div>

                <div className="p-4 flex-1 overflow-y-auto w-full space-y-6">
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-white">Fallback Path</label>
                        <input
                            type="checkbox"
                            checked={Boolean(isFallback)}
                            onChange={(e) => handleEdgeChange({ isFallback: e.target.checked, conditions: [] })} // clear conditions if fallback
                            className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-cyan-600 focus:ring-cyan-600 focus:ring-offset-gray-900"
                        />
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed -mt-4">
                        If checked, this path is only taken if no other conditions match.
                    </p>

                    {!isFallback && (
                        <div>
                            <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                    Conditions
                                </label>
                                <button
                                    onClick={addCondition}
                                    className="p-1 rounded bg-cyan-900/30 text-cyan-400 hover:bg-cyan-900/50 hover:text-cyan-300 transition"
                                    title="Add Condition"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>

                            {conditions.length === 0 ? (
                                <div className="text-xs text-gray-600 italic bg-gray-900/50 p-3 rounded-md text-center border border-dashed border-gray-800">
                                    No conditions set. This path runs immediately.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {conditions.map((cond, i) => (
                                        <div key={cond.id} className="bg-gray-900/80 p-3 rounded-lg border border-gray-800 relative group transition-all hover:border-gray-700 shadow-sm">
                                            <div className="absolute -top-2 -left-2 bg-gray-800 text-gray-400 text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold border border-gray-700 z-10">
                                                {i + 1}
                                            </div>
                                            <button
                                                onClick={() => removeCondition(cond.id)}
                                                className="absolute -top-2 -right-2 bg-rose-900/80 text-rose-300 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-rose-800/50 hover:bg-rose-800"
                                            >
                                                <X size={12} />
                                            </button>

                                            <div className="space-y-3 mt-1">
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block tracking-wider">Type</label>
                                                    <select
                                                        value={cond.type}
                                                        onChange={(e) => updateCondition(cond.id, 'type', e.target.value)}
                                                        className="w-full bg-gray-950 border border-gray-700 rounded p-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                                    >
                                                        <option value="intent">Intent Match</option>
                                                        <option value="keyword">Keyword detection</option>
                                                        <option value="silence">Silence Detected</option>
                                                    </select>
                                                </div>

                                                {(cond.type === 'intent' || cond.type === 'keyword') && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block tracking-wider">Logic</label>
                                                            <select
                                                                value={cond.operator}
                                                                onChange={(e) => updateCondition(cond.id, 'operator', e.target.value)}
                                                                className="w-full bg-gray-950 border border-gray-700 rounded p-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                                            >
                                                                <option value="equals">Equals</option>
                                                                <option value="contains">Contains</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block tracking-wider">Value</label>
                                                            <input
                                                                type="text"
                                                                value={cond.value || ''}
                                                                onChange={(e) => updateCondition(cond.id, 'value', e.target.value)}
                                                                placeholder="e.g. Sales"
                                                                className="w-full bg-gray-950 border border-gray-700 rounded p-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none placeholder:text-gray-600"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </aside>
        );
    }

    // --- NODE EDITOR RENDER (Original logic, styled) ---
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        updateNode(selectedNode!.id, { [e.target.name]: e.target.value });
    };

    return (
        <aside className="h-full bg-gray-950 border-l border-gray-800 text-gray-300 w-80 flex flex-col shadow-2xl z-10">
            <div className="p-4 border-b border-gray-800 shrink-0 bg-gray-900/50">
                <h3 className="font-bold text-white uppercase tracking-wider text-sm flex items-center gap-2">
                    {selectedNode!.type} Node Config
                </h3>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">ID: {selectedNode!.id}</p>
            </div>

            <div className="p-5 flex-1 overflow-y-auto w-full space-y-6">
                {/* Node Label Editing - General for all nodes */}
                <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Display Label
                    </label>
                    <input
                        name="label"
                        value={selectedNode!.data.label as string || ''}
                        onChange={handleChange}
                        className="w-full bg-gray-900 border-gray-700 text-sm rounded px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500 border focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium"
                        placeholder="E.g., Wait for Input"
                    />
                </div>

                {/* DECISION NODE FIELDS */}
                {selectedNode!.type === 'decision' && (
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-2">
                            Branching Instructions (LLM)
                        </label>
                        <textarea
                            name="systemPrompt"
                            value={selectedNode!.data.systemPrompt as string || ''}
                            onChange={handleChange}
                            rows={6}
                            className="w-full bg-gray-900 border-gray-700 text-sm rounded px-3 py-2.5 text-white focus:outline-none focus:border-cyan-500 border focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder-gray-600 leading-relaxed"
                            placeholder="e.g. Determine if the user wants Sales, Support, or to End the Call..."
                        />
                        <p className="mt-2 text-[10px] text-gray-500 leading-relaxed">
                            This prompt is appended when this node is active to help evaluate the outgoing edge conditions.
                        </p>
                    </div>
                )}

                {/* SPEAK NODE FIELDS */}
                {selectedNode!.type === 'speak' && (
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-green-500 mb-2">
                            Agent Spoken Text
                        </label>
                        <textarea
                            name="text"
                            value={selectedNode!.data.text as string || ''}
                            onChange={handleChange}
                            rows={5}
                            className="w-full bg-gray-900 border-gray-700 text-sm rounded px-3 py-2.5 text-white focus:outline-none focus:border-green-500 border focus:ring-1 focus:ring-green-500/50 transition-all placeholder-gray-600 leading-relaxed"
                            placeholder="What the agent should literally say out loud..."
                        />
                    </div>
                )}

            </div>
        </aside>
    );
}
