'use client';

import { Handle, Position, NodeProps } from '@xyflow/react';
import { Square, Settings } from 'lucide-react';

export default function EndNode({ data, selected }: NodeProps) {
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
            <Square size={14} fill="currentColor" />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${selected ? 'text-white' : 'text-gray-400'}`}>
            {data.label as string || 'End Flow'}
          </span>
        </div>
        <Settings size={14} className={selected ? 'text-white' : 'text-gray-500'} />
      </div>

      {/* Body */}
      <div className="p-5">
        <p className="text-[11px] text-gray-500 leading-relaxed mb-6">
          This node marks the termination of the conversation. Once reached, the agent will hang up the call.
        </p>

        <div className="py-2 px-3 bg-red-500/5 rounded border border-red-500/10 flex items-center justify-center">
          <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Termination Point</span>
        </div>
      </div>
    </div>
  );
}
