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
    BackgroundVariant,
} from '@xyflow/react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { v4 as uuidv4 } from 'uuid';
import { Search, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

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
    const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();

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
                className="bg-[#0a0c10]"
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={25}
                    size={1.5}
                    color="#1e293b"
                />

                {/* Custom Floating Controls */}
                <Panel position="top-left" className="m-4 flex items-center gap-1 p-1 bg-[#11141d] border border-gray-800 rounded-lg shadow-2xl">
                    <button
                        onClick={() => zoomOut()}
                        className="p-2 hover:bg-gray-800 rounded text-gray-500 hover:text-white transition-colors"
                        title="Zoom Out"
                    >
                        <ZoomOut size={18} />
                    </button>
                    <button
                        onClick={() => zoomIn()}
                        className="p-2 hover:bg-gray-800 rounded text-gray-500 hover:text-white transition-colors"
                        title="Zoom In"
                    >
                        <ZoomIn size={18} />
                    </button>
                    <div className="h-4 w-[1px] bg-gray-800 mx-1"></div>
                    <button
                        onClick={() => fitView()}
                        className="px-3 py-2 flex items-center justify-center gap-2 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors text-xs font-bold"
                    >
                        <Maximize size={16} />
                        Zoom to Fit
                    </button>
                </Panel>

                <MiniMap
                    className="!bg-[#11141d] border !border-gray-800 rounded-xl"
                    maskColor="rgba(0, 0, 0, 0.6)"
                    nodeColor="#1e40af"
                />
            </ReactFlow>
        </div>
    );
}
