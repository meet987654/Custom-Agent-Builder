'use client';

import React from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { Condition } from '../schema/workflowSchema';
import { Plus, X, ArrowRight, Settings2, BarChart3 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function NodeEditorPanel() {
    const { nodes, edges, selectedNodeId, selectedEdgeId, updateNode, updateEdge } = useWorkflowStore();
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

    if (!selectedNode && !selectedEdge) {
        return (
            <div className="p-8 text-gray-500 text-xs flex h-full items-center justify-center text-center font-medium leading-relaxed bg-[#11141d]">
                <div className="max-w-[180px]">
                    <Settings2 size={32} className="mx-auto mb-4 text-gray-700 opacity-20" />
                    Select a node or connection line on the canvas to configure it here.
                </div>
            </div>
        );
    }

    const handleNodeChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        updateNode(selectedNode!.id, { [e.target.name]: e.target.value });
    };

    const handleEdgeChange = (dataToUpdate: any) => {
        updateEdge(selectedEdge!.id, dataToUpdate);
    };

    return (
        <aside className="h-full bg-[#11141d] text-gray-400 select-none flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-800 shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <span className="px-2 py-0.5 bg-blue-600/20 text-blue-500 rounded text-[9px] font-bold uppercase tracking-widest">
                        Active {selectedNode ? 'Node' : 'Connection'}
                    </span>
                    <button className="text-gray-600 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <h3 className="text-2xl font-bold text-white tracking-tight">Configuration</h3>
            </div>

            <div className="flex-1 overflow-y-auto w-full p-6 space-y-8">
                {selectedNode && (
                    <>
                        {/* Node Name */}
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                                Node Name
                            </label>
                            <input
                                name="label"
                                value={selectedNode.data.label as string || ''}
                                onChange={handleNodeChange}
                                className="w-full bg-[#0a0c10] border border-gray-800 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-600 transition-all font-medium"
                                placeholder="E.g., Conversation Start"
                            />
                        </div>

                        {/* Node Specific Fields */}
                        {selectedNode.type === 'start' && (
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                                    Trigger Type
                                </label>
                                <select
                                    className="w-full bg-[#0a0c10] border border-gray-800 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-600 appearance-none"
                                >
                                    <option>Inbound Call</option>
                                    <option>Outbound Call</option>
                                    <option>API Trigger</option>
                                </select>
                            </div>
                        )}

                        {selectedNode.type === 'speak' && (
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                                    Initial Greeting
                                </label>
                                <textarea
                                    name="text"
                                    value={selectedNode.data.text as string || ''}
                                    onChange={handleNodeChange}
                                    rows={4}
                                    className="w-full bg-[#0a0c10] border border-gray-800 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-600 transition-all resize-none leading-relaxed"
                                    placeholder="Hello! How can I assist you today?"
                                />
                            </div>
                        )}

                        {selectedNode.type === 'decision' && (
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                                    Logic Instructions
                                </label>
                                <textarea
                                    name="systemPrompt"
                                    value={selectedNode.data.systemPrompt as string || ''}
                                    onChange={handleNodeChange}
                                    rows={4}
                                    className="w-full bg-[#0a0c10] border border-gray-800 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-600 transition-all resize-none leading-relaxed"
                                    placeholder="Identify user intent..."
                                />
                            </div>
                        )}

                        {/* Advanced Stats Section (Mock) */}
                        <div className="pt-4">
                            <div className="bg-[#0a0c10]/40 border border-gray-800 rounded-xl p-5 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-blue-600/30 group-hover:bg-blue-600 transition-colors"></div>
                                <div className="flex items-center gap-2 mb-4">
                                    <BarChart3 size={14} className="text-blue-500" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Advanced Stats</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Hits</div>
                                        <div className="text-2xl font-bold text-white tracking-tight">1,284</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Dropoff</div>
                                        <div className="text-2xl font-bold text-white tracking-tight">2.4%</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {selectedEdge && (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                                Condition Builder
                            </label>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <label className="text-xs font-medium text-gray-400">Fallback Path</label>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(selectedEdge.data?.isFallback)}
                                        onChange={(e) => handleEdgeChange({ isFallback: e.target.checked, conditions: [] })}
                                        className="w-4 h-4 rounded bg-[#0a0c10] border-gray-800 text-blue-600 focus:ring-blue-600"
                                    />
                                </div>
                                {/* Simplified logic for redesign scope */}
                                <p className="text-[10px] text-gray-500 leading-relaxed italic border-l border-gray-800 pl-3">
                                    Configure conditions for transit between nodes.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-gray-800 shrink-0 grid grid-cols-2 gap-4">
                <button className="py-3 px-4 rounded-xl bg-gray-800/50 hover:bg-gray-800 text-gray-300 transition-colors text-sm font-bold">
                    Cancel
                </button>
                <button className="py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors text-sm font-bold shadow-lg shadow-blue-600/10">
                    Apply
                </button>
            </div>
        </aside>
    );
}
