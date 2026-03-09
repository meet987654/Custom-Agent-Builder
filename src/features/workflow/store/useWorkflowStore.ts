import { create } from 'zustand';
import {
    Node,
    Edge,
    OnNodesChange,
    OnEdgesChange,
    OnConnect,
    applyNodeChanges,
    applyEdgeChanges,
    addEdge,
    Connection,
} from '@xyflow/react';

export type WorkflowState = {
    nodes: Node[];
    edges: Edge[];
    selectedNodeId: string | null;
    onNodesChange: OnNodesChange;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    addNode: (node: Node) => void;
    updateNode: (id: string, data: any) => void;
    removeNode: (id: string) => void;
    setSelectedNodeId: (id: string | null) => void;

    // Edge Selection
    selectedEdgeId: string | null;
    setSelectedEdgeId: (id: string | null) => void;
    updateEdge: (id: string, data: any) => void;

    setGraph: (nodes: Node[], edges: Edge[]) => void;
    resetWorkflow: () => void;
};

const initialNodes: Node[] = [
    {
        id: 'start-1',
        type: 'start',
        position: { x: 250, y: 50 },
        data: { label: 'Start' },
    },
];

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    nodes: initialNodes,
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,

    onNodesChange: (changes) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
    },

    onEdgesChange: (changes) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
        });
    },

    onConnect: (connection: Connection) => {
        set({
            edges: addEdge({ ...connection, data: { conditions: [] } }, get().edges),
        });
    },

    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),

    addNode: (node) => {
        set({ nodes: [...get().nodes, node] });
    },

    updateNode: (id, data) => {
        set({
            nodes: get().nodes.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, ...data } } : node
            ),
        });
    },

    removeNode: (id) => {
        set({
            nodes: get().nodes.filter((node) => node.id !== id),
            edges: get().edges.filter(
                (edge) => edge.source !== id && edge.target !== id
            ),
            selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
        });
    },

    setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
    setSelectedEdgeId: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

    updateEdge: (id, data) => {
        set({
            edges: get().edges.map((edge) =>
                edge.id === id ? { ...edge, data: { ...edge.data, ...data } } : edge
            ),
        });
    },

    setGraph: (nodes, edges) => {
        set({ nodes, edges, selectedNodeId: null, selectedEdgeId: null });
    },

    resetWorkflow: () => {
        set({ nodes: initialNodes, edges: [], selectedNodeId: null, selectedEdgeId: null });
    },
}));
