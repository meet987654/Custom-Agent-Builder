import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath, Edge } from '@xyflow/react';
import { WorkflowEdge } from '../../schema/workflowSchema';

export default function ConditionEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
    selected,
}: EdgeProps<Edge>) {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    // Decide if this is a "fallback" edge or a conditional edge
    const isFallback = data?.isFallback;
    const conditions = (data?.conditions as any[]) || [];

    // Edge coloring logic
    const strokeColor = selected
        ? '#4f46e5' // indigo-600 when selected
        : isFallback
            ? '#f43f5e' // rose-500 for fallback path
            : conditions.length > 0
                ? '#06b6d4' // cyan-500 for condition path
                : '#4b5563'; // gray-600 for default unconfigured path

    // Format label text based on conditions
    let labelText = 'Unconfigured';
    if (isFallback) {
        labelText = 'Fallback (Else)';
    } else if (conditions.length > 0) {
        const firstCond = conditions[0];
        labelText = `If ${firstCond.type} ${firstCond.operator || ''} '${firstCond.value || ''}'`;
        if (conditions.length > 1) {
            labelText += ` (+${conditions.length - 1} more)`;
        }
    }

    return (
        <>
            <BaseEdge
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    ...(style || {}),
                    stroke: strokeColor,
                    strokeWidth: selected ? 3 : 2,
                    filter: selected ? `drop - shadow(0 0 5px ${strokeColor}40)` : 'none'
                }}
            />
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50 %, -50 %) translate(${labelX}px, ${labelY}px)`,
                        pointerEvents: 'all',
                    }}
                    className={`nodrag nopan px - 2 py - 1 rounded bg - gray - 900 border text - xs shadow - md font - medium z - 10 
              ${selected ? 'border-indigo-500 shadow-indigo-500/20' : 'border-gray-700'}
              ${isFallback ? 'text-rose-400' : conditions.length > 0 ? 'text-cyan-400' : 'text-gray-400'}
`}
                >
                    {labelText}
                </div>
            </EdgeLabelRenderer>
        </>
    );
}
