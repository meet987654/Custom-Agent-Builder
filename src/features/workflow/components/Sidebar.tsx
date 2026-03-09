'use client';

import React from 'react';
import { GitBranch, MessageSquare, Ear, Square, Play } from 'lucide-react';

export default function Sidebar() {
    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <aside className="p-4 flex flex-col h-full bg-gray-900 border-r border-gray-800 text-gray-300 w-64">
            <h3 className="text-sm font-bold uppercase tracking-widest mb-4 text-gray-500">Nodes Palette</h3>
            <div className="flex flex-col gap-3">
                <div
                    className="flex items-center gap-3 p-3 border border-indigo-800 bg-indigo-950/50 rounded-lg cursor-grab hover:bg-indigo-900/50 hover:border-indigo-500 transition-all text-indigo-300 shadow-sm"
                    onDragStart={(event) => onDragStart(event, 'start')}
                    draggable
                >
                    <Play size={16} fill="currentColor" className="text-indigo-400" />
                    <span className="text-sm font-medium">Start Node</span>
                </div>

                <div
                    className="flex items-center gap-3 p-3 border border-cyan-800 bg-cyan-950/50 rounded-lg cursor-grab hover:bg-cyan-900/50 hover:border-cyan-500 transition-all text-cyan-300 shadow-sm"
                    onDragStart={(event) => onDragStart(event, 'decision')}
                    draggable
                >
                    <GitBranch size={16} className="text-cyan-400" />
                    <span className="text-sm font-medium">Decision Node</span>
                </div>

                <div
                    className="flex items-center gap-3 p-3 border border-green-800 bg-green-950/50 rounded-lg cursor-grab hover:bg-green-900/50 hover:border-green-500 transition-all text-green-300 shadow-sm"
                    onDragStart={(event) => onDragStart(event, 'speak')}
                    draggable
                >
                    <MessageSquare size={16} className="text-green-400" />
                    <span className="text-sm font-medium">Speak Node</span>
                </div>

                <div
                    className="flex items-center gap-3 p-3 border border-yellow-800 bg-yellow-950/50 rounded-lg cursor-grab hover:bg-yellow-900/50 hover:border-yellow-500 transition-all text-yellow-300 shadow-sm"
                    onDragStart={(event) => onDragStart(event, 'listen')}
                    draggable
                >
                    <Ear size={16} className="text-yellow-400" />
                    <span className="text-sm font-medium">Listen Node</span>
                </div>

                <div
                    className="flex items-center gap-3 p-3 border border-gray-700 bg-gray-800/50 rounded-lg cursor-grab hover:bg-gray-700 hover:border-gray-500 transition-all text-gray-300 shadow-sm"
                    onDragStart={(event) => onDragStart(event, 'end')}
                    draggable
                >
                    <Square size={16} fill="currentColor" className="text-gray-400" />
                    <span className="text-sm font-medium">End Node</span>
                </div>
            </div>

            <div className="mt-auto pt-4 text-xs text-gray-500 border-t border-gray-800 leading-relaxed">
                <span className="font-semibold text-gray-400">Pro Tip:</span> Drag a node onto the canvas to add it to your voice agent's workflow. Select a node to configure it.
            </div>
        </aside>
    );
}
