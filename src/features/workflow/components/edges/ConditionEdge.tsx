'use client';

import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath, Edge } from '@xyflow/react';

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
        ? '#3b82f6' // blue-500 when selected
        : isFallback
            ? '#ef4444' // red-500 for fallback path
            : '#1e3a8a'; // dark-blue for unconfigured path

    // Format label text based on conditions
    let labelText = '';
    if (isFallback) {
        labelText = 'Fallback';
    } else if (conditions.length > 0) {
        const firstCond = conditions[0];
        labelText = `${firstCond.type === 'intent' ? 'Intent' : 'Match'}: ${firstCond.value || '...'}`;
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
                    strokeDasharray: isFallback ? '5,5' : '8,8',
                    filter: selected ? `drop-shadow(0 0 8px #3b82f6)` : 'none',
                    transition: 'all 0.2s ease',
                }}
            />
            {labelText && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            pointerEvents: 'all',
                        }}
                        className={`nodrag nopan px-2 py-0.5 rounded-full bg-[#11141d] border text-[9px] font-bold uppercase tracking-widest shadow-xl z-20 
                        ${selected ? 'border-blue-500 text-blue-400' : 'border-gray-800 text-gray-500'}
                        ${isFallback ? 'text-red-400 border-red-900/50' : ''}
                        `}
                    >
                        {labelText}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}
