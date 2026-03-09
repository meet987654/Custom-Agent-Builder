import { z } from 'zod';

export const conditionSchema = z.object({
    id: z.string(),
    type: z.enum(['intent', 'keyword', 'confidence', 'silence', 'catchAll']),
    operator: z.enum(['equals', 'contains', 'greaterThan', 'lessThan', 'always']).optional(),
    value: z.any().optional(),
});

export type Condition = z.infer<typeof conditionSchema>;

export const baseNodeSchema = z.object({
    id: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    selected: z.boolean().optional(),
});

export const startNodeDataSchema = z.object({
    label: z.string().default('Start'),
});

export const decisionNodeDataSchema = z.object({
    name: z.string(),
    systemPrompt: z.string(),
    fallbackTargetId: z.string().optional(),
});

export const speakNodeDataSchema = z.object({
    text: z.string(),
});

export const listenNodeDataSchema = z.object({
    timeoutMs: z.number(),
});

export const nodeSchema = z.discriminatedUnion('type', [
    baseNodeSchema.extend({ type: z.literal('start'), data: startNodeDataSchema }),
    baseNodeSchema.extend({ type: z.literal('decision'), data: decisionNodeDataSchema }),
    baseNodeSchema.extend({ type: z.literal('speak'), data: speakNodeDataSchema }),
    baseNodeSchema.extend({ type: z.literal('listen'), data: listenNodeDataSchema }),
    baseNodeSchema.extend({ type: z.literal('end'), data: z.object({ label: z.string().default('End') }) }),
]);

export type WorkflowNode = z.infer<typeof nodeSchema>;

export const edgeSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
    data: z.object({
        conditions: z.array(conditionSchema).optional(),
        isFallback: z.boolean().optional(),
    }).optional(),
    type: z.string().optional(),
    animated: z.boolean().optional(),
    style: z.any().optional(),
    selected: z.boolean().optional(),
});

export type WorkflowEdge = z.infer<typeof edgeSchema>;

export const workflowSchema = z.object({
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
});

export type WorkflowGraph = z.infer<typeof workflowSchema>;
