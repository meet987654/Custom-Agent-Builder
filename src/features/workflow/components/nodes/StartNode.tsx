import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';

export default function StartNode({ data, selected }: NodeProps) {
    return (
        <div className={`rounded-xl border-2 bg-indigo-950/90 backdrop-blur-sm shadow-lg min-w-[140px] transition-all
        ${selected ? 'border-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.3)]' : 'border-indigo-800'}`}>
            <div className="flex items-center gap-2 p-3 bg-indigo-900/40 rounded-xl justify-center">
                <div className="p-1 bg-indigo-500/20 rounded border border-indigo-500/50">
                    <Play size={12} className="text-indigo-400" fill="currentColor" />
                </div>
                <span className="text-xs font-bold text-indigo-100 uppercase tracking-widest">{data.label as string || 'Start'}</span>
            </div>
            <Handle type="source" position={Position.Bottom} className="w-4 h-2 rounded bg-indigo-500 border-none" />
        </div>
    );
}
