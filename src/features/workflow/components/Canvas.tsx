'use client';

import React, { useCallback, useRef } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    useReactFlow,
    Panel,
    Node,
    MiniMap,
} from '@xyflow/react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { v4 as uuidv4 } from 'uuid';

import StartNode from './nodes/StartNode';
import DecisionNode from './nodes/DecisionNode';
import SpeakNode from './nodes/SpeakNode';
import ListenNode from './nodes/ListenNode';
import EndNode from './nodes/EndNode';
import ConditionEdge from './edges/ConditionEdge';

const nodeTypes = {
    start: StartNode,
    decision: DecisionNode,
    speak: SpeakNode,
    listen: ListenNode,
    end: EndNode,
};

const edgeTypes = {
    condition: ConditionEdge,
};

export default function Canvas() {
    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        setSelectedNodeId,
        setSelectedEdgeId,
    } = useWorkflowStore();

    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { screenToFlowPosition } = useReactFlow();

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');

            // Check if the dropped element is valid
            if (typeof type === 'undefined' || !type) {
                return;
            }

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode: Node = {
                id: `${type}-${uuidv4().substring(0, 6)}`,
                type,
                position,
                data: { label: `${type.charAt(0).toUpperCase() + type.slice(1)} node` },
            };

            addNode(newNode);
        },
        [screenToFlowPosition, addNode],
    );

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id);
    }, [setSelectedNodeId]);

    const onEdgeClick = useCallback((_: React.MouseEvent, edge: any) => {
        setSelectedEdgeId(edge.id);
    }, [setSelectedEdgeId]);

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, [setSelectedNodeId, setSelectedEdgeId]);

    return (
        <div className="reactflow-wrapper flex-1 h-full w-full" ref={reactFlowWrapper}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{ type: 'condition', animated: true }}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                onPaneClick={onPaneClick}
                fitView
                className="bg-gray-950"
            >
                <Background gap={16} color="#333" />
                <Controls className="bg-gray-800 border border-gray-700 fill-white !text-white" />
                <MiniMap
                    className="!bg-gray-900 border !border-gray-800 rounded-md"
                    maskColor="rgba(0, 0, 0, 0.4)"
                />
                <Panel position="top-right" className="bg-gray-800 px-3 py-1 rounded text-xs text-gray-400 border border-gray-700 shadow flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div> Connected to Zustand
                </Panel>
            </ReactFlow>
        </div>
    );
}
