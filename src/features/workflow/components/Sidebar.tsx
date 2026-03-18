'use client';

import React from 'react';
import { GitBranch, MessageSquare, Ear, Square, Play, Send } from 'lucide-react';

export default function Sidebar() {
    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const nodeItems = [
        {
            type: 'start',
            title: 'Start',
            desc: 'Entry point',
            icon: <Play size={18} className="text-whitefill-current" fill="white" />
        },
        {
            type: 'decision',
            title: 'Decision',
            desc: 'Conditional logic',
            icon: <GitBranch size={18} className="text-white" />
        },
        {
            type: 'speak',
            title: 'Speak',
            desc: 'Output response',
            icon: <MessageSquare size={18} className="text-white" />
        },
        {
            type: 'listen',
            title: 'Listen',
            desc: 'Wait for input',
            icon: <Ear size={18} className="text-white" />
        },
        {
            type: 'end',
            title: 'End',
            desc: 'Terminate flow',
            icon: <Square size={18} className="text-white" fill="white" />
        }
    ];

    return (
        <aside className="p-6 flex flex-col h-full bg-[#11141d] text-gray-400 select-none">
            <div className="mb-8">
                <h3 className="text-lg font-bold text-white mb-1">Nodes Palette</h3>
                <p className="text-xs text-gray-500">Drag nodes to build flow</p>
            </div>

            <div className="flex flex-col gap-4">
                {nodeItems.map((item) => (
                    <div
                        key={item.type}
                        className="group flex items-center gap-4 p-4 border border-gray-800 bg-[#0a0c10]/40 rounded-xl cursor-grab hover:border-blue-600/50 hover:bg-blue-600/5 transition-all shadow-sm"
                        onDragStart={(event) => onDragStart(event, item.type)}
                        draggable
                    >
                        <div className="w-10 h-10 shrink-0 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.2)] group-hover:scale-110 transition-transform">
                            {item.icon}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-white tracking-tight">{item.title}</span>
                            <span className="text-xs text-gray-500 truncate">{item.desc}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-auto py-6">
                <div className="bg-[#0a0c10]/40 border border-gray-800 rounded-xl p-4">
                    <h4 className="text-[10px] font-bold text-white uppercase tracking-widest mb-2">Getting Started</h4>
                    <p className="text-[10px] text-gray-500 leading-normal">
                        Drag nodes from the left palette onto this canvas to build your interaction logic.
                    </p>
                </div>
            </div>
        </aside>
    );
}
