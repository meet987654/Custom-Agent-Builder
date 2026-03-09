import { Handle, Position, NodeProps } from '@xyflow/react';
import { Square } from 'lucide-react';

export default function EndNode({ data, selected }: NodeProps) {
    return (
        <div className={`rounded-xl border-2 bg-gray-900/90 backdrop-blur-sm shadow-lg min-w-[140px] transition-all
        ${selected ? 'border-gray-500 shadow-[0_0_15px_rgba(156,163,175,0.2)]' : 'border-gray-800'}`}>
            <Handle type="target" position={Position.Top} className="w-4 h-2 rounded bg-gray-500 border-none" />
            <div className="flex items-center gap-2 p-3 bg-gray-800/40 rounded-xl justify-center">
                <div className="p-1 bg-gray-500/20 rounded border border-gray-600/50">
                    <Square size={12} className="text-gray-400" fill="currentColor" />
                </div>
                <span className="text-xs font-bold text-gray-200 uppercase tracking-widest">{data.label as string || 'End Flow'}</span>
            </div>
        </div>
    );
}
