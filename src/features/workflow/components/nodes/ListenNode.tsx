import { Handle, Position, NodeProps } from '@xyflow/react';
import { Ear } from 'lucide-react';

export default function ListenNode({ data, selected }: NodeProps) {
    return (
        <div className={`rounded-xl border-2 bg-yellow-950/80 backdrop-blur-sm shadow-lg min-w-[200px] max-w-[250px] transition-all
        ${selected ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.2)]' : 'border-yellow-800'}`}>
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-yellow-500 border-none" />
            <div className="flex items-center gap-2 p-3 bg-yellow-900/40 border-b border-yellow-900/50 rounded-t-xl">
                <div className="p-1.5 bg-yellow-500/20 rounded-md">
                    <Ear size={14} className="text-yellow-400" />
                </div>
                <span className="text-sm font-semibold text-yellow-100">{data.label as string || 'Wait & Listen'}</span>
            </div>
            <div className="p-4 flex items-center justify-center">
                <span className="text-xs text-yellow-500 animate-pulse tracking-wide font-medium">Listening for input...</span>
            </div>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-yellow-500 border-none" />
        </div>
    );
}
