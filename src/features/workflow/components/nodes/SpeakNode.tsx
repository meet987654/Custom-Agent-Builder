'use client';

import { Handle, Position, NodeProps } from '@xyflow/react';
import { MessageSquare, Settings } from 'lucide-react';

export default function SpeakNode({ data, selected }: NodeProps) {
  return (
    <div className={`rounded-xl border bg-[#11141d] shadow-2xl transition-all overflow-hidden w-[280px]
        ${selected ? 'border-blue-500 ring-4 ring-blue-500/20' : 'border-gray-800'}`}>

      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-blue-600 !border-2 !border-[#0a0c10] !-left-1.5"
      />

      {/* Header */}
      <div className={`p-4 flex items-center justify-between transition-colors ${selected ? 'bg-blue-600 shadow-[0_4px_15px_rgba(37,99,235,0.3)]' : 'bg-gray-800/50 text-gray-400'}`}>
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded bg-white/20 ${selected ? 'text-white' : 'text-gray-500'}`}>
            <MessageSquare size={14} />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${selected ? 'text-white' : 'text-gray-400'}`}>
            {data.label as string || 'Speak'}
          </span>
        </div>
        <Settings size={14} className={selected ? 'text-white' : 'text-gray-500'} />
      </div>

      {/* Body */}
      <div className="p-5">
        <div className="text-[11px] text-gray-500 italic leading-relaxed mb-6 line-clamp-2">
          {data.text ? `"${data.text as string}"` : 'Configure the agent\'s response text...'}
        </div>

        <button className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:bg-blue-500/10 rounded border border-blue-500/20 transition-colors">
          Preview Audio
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-blue-600 !border-2 !border-[#0a0c10] !-right-1.5"
      />
    </div>
  );
}
