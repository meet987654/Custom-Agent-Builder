import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

export default function DecisionNode({ data, selected }: NodeProps) {
    return (
        <div className={`rounded-xl border-2 bg-cyan-950/80 backdrop-blur-sm shadow-lg min-w-[250px] max-w-[300px] transition-all
        ${selected ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'border-cyan-800'}`}>
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-cyan-500 border-none" />
            <div className="flex items-center gap-2 p-3 bg-cyan-900/40 border-b border-cyan-900/50 rounded-t-xl">
                <div className="p-1.5 bg-cyan-500/20 rounded-md">
                    <GitBranch size={14} className="text-cyan-400" />
                </div>
                <span className="text-sm font-semibold text-cyan-100">{data.label as string || 'Decision'}</span>
            </div>
            <div className="p-4">
                <div className="text-xs text-cyan-300/80 line-clamp-3 italic leading-relaxed">
                    {data.systemPrompt ? `System: ${data.systemPrompt}` : <span className="text-cyan-700">No prompt context provided...</span>}
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-cyan-500 border-none" />
        </div>
    );
}
