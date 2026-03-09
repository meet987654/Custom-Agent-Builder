import { Handle, Position, NodeProps } from '@xyflow/react';
import { MessageSquare } from 'lucide-react';

export default function SpeakNode({ data, selected }: NodeProps) {
    return (
        <div className={`rounded-xl border-2 bg-green-950/80 backdrop-blur-sm shadow-lg min-w-[220px] max-w-[280px] transition-all
        ${selected ? 'border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.2)]' : 'border-green-800'}`}>
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-green-500 border-none" />
            <div className="flex items-center gap-2 p-3 bg-green-900/40 border-b border-green-900/50 rounded-t-xl">
                <div className="p-1.5 bg-green-500/20 rounded-md">
                    <MessageSquare size={14} className="text-green-400" />
                </div>
                <span className="text-sm font-semibold text-green-100">{data.label as string || 'Speak'}</span>
            </div>
            <div className="p-4 text-xs text-green-300/80 max-h-24 overflow-hidden text-ellipsis !leading-relaxed flex flex-col gap-1">
                {data.text ? (
                    <span className="italic">"{data.text as string}"</span>
                ) : (
                    <span className="text-green-600 italic">Configure text in sidebar...</span>
                )}
            </div>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-green-500 border-none" />
        </div>
    );
}
