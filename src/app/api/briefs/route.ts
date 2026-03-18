import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// Language code mapping for the agent config
const LANGUAGE_MAP: Record<string, string> = {
  'English': 'en',
  'Hindi': 'hi',
  'Gujarati': 'gu',
  'Other': 'en',
};

// Voice ID mapping by gender (Cartesia sonic-2 defaults)
const VOICE_MAP: Record<string, string> = {
  'Male': 'ee7ea9f8-c0c1-498c-9f62-dc2627e1e3ef',
  'Female': '794f9389-aac1-45b6-b726-9d9369183238',
};

/* ──────────────────────────────────────────────
   GREETING TEMPLATES by use case
   ────────────────────────────────────────────── */

const GREETING_MAP: Record<string, string> = {
  'Appointment Booking': 'Hello! Thank you for calling. I can help you book an appointment. How can I assist you today?',
  'Lead Qualification': 'Hi there! Thanks for reaching out. I would love to learn more about what you are looking for. Can we start with your name?',
  'Customer Support': 'Hello! Welcome to our support line. I am here to help resolve any issues you may have. What can I help you with?',
  'Survey': 'Hi! Thank you for taking the time to speak with us. I have a few quick questions if you do not mind. Shall we begin?',
  'Outbound Campaign': 'Hello! I am calling on behalf of our team. Do you have a moment to chat? I have some information that might interest you.',
  'Other': 'Hello! Thank you for calling. How can I help you today?',
};

/* ──────────────────────────────────────────────
   PARSE FORBIDDEN TOPICS to array
   ────────────────────────────────────────────── */

function parseForbiddenTopics(raw?: string | null): string[] {
  if (!raw || !raw.trim()) return [];
  // Split by comma, semicolons, or newlines — normalize
  return raw
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/* ──────────────────────────────────────────────
   GENERATE SYSTEM PROMPT (BUG 1 FIX)
   Forbidden topics block placed at the TOP
   ────────────────────────────────────────────── */

function generateSystemPrompt(brief: {
  business_name: string;
  use_case_type: string;
  use_case_description: string;
  key_tasks: string[];
  tone: string;
  strictness_level: number;
  handle_objections: boolean;
  forbidden_topics?: string | null;
}): string {
  const toneMap: Record<string, string> = {
    'Formal': 'professional and formal',
    'Friendly': 'warm, friendly, and conversational',
    'Neutral': 'balanced and neutral',
  };

  const strictnessGuide = brief.strictness_level >= 4
    ? 'You must stay strictly on topic. Do not engage with unrelated questions — politely redirect.'
    : brief.strictness_level >= 2
      ? 'You can briefly engage with off-topic questions but should guide the conversation back.'
      : 'You can have natural conversations while gently steering toward your purpose.';

  const objectionLine = brief.handle_objections
    ? 'If the user raises objections or concerns, acknowledge them empathetically and address them clearly before proceeding.'
    : '';

  const tasksLine = brief.key_tasks.length > 0
    ? `Your key responsibilities are: ${brief.key_tasks.join(', ')}.`
    : '';

  // ─── BUG 1 FIX: Build the STRICT PROHIBITIONS block ───
  const forbiddenTopicsArray = parseForbiddenTopics(brief.forbidden_topics);
  let prohibitionsBlock = '';

  if (forbiddenTopicsArray.length > 0) {
    const topicLines = forbiddenTopicsArray
      .map((topic) => `- NEVER ask about or discuss: ${topic}`)
      .join('\n');

    prohibitionsBlock = [
      '=== STRICT PROHIBITIONS (NON-NEGOTIABLE) ===',
      'You are ABSOLUTELY FORBIDDEN from doing the following.',
      'These are hard rules. No exception. No workaround.',
      'No matter what the user says or asks:',
      topicLines,
      'If the user brings up any of these topics, respond with:',
      `"I'm not able to help with that, but I can assist you with ${brief.use_case_type.toLowerCase()}."`,
      'Then immediately redirect to the next step in the workflow.',
      '=== END STRICT PROHIBITIONS ===',
      '', // blank line separator
    ].join('\n');
  }

  // ─── Assemble final prompt: prohibitions FIRST, then core instructions ───
  const corePrompt = [
    `You are a ${toneMap[brief.tone] || 'professional'} voice assistant for ${brief.business_name}.`,
    `Your primary purpose is: ${brief.use_case_description}`,
    tasksLine,
    `Be concise and natural. Keep responses to 1–3 sentences.`,
    `Do not use lists, bullet points, or formatting in your responses.`,
    strictnessGuide,
    objectionLine,
  ].filter(Boolean).join('\n');

  // Prohibitions at the TOP for maximum enforcement
  return prohibitionsBlock + corePrompt;
}

/* ──────────────────────────────────────────────
   GENERATE WORKFLOW SCHEMA (BUG 2 FIX)
   Deterministic flow from brief inputs
   Uses the same node/edge format as WorkflowEditor
   ────────────────────────────────────────────── */

interface FlowNode {
  id: string;
  type: 'start' | 'speak' | 'listen' | 'decision' | 'end';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  data?: Record<string, unknown>;
  type?: string;
  animated?: boolean;
}

function generateWorkflowSchema(brief: {
  use_case_type: string;
  key_tasks: string[];
  handle_objections: boolean;
  forbidden_topics?: string | null;
  business_name: string;
  primary_language: string;
}): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const forbiddenTopicsArray = parseForbiddenTopics(brief.forbidden_topics);

  const X_CENTER = 250;
  let y = 50;
  let nodeIdx = 0;
  const Y_STEP = 140;

  const nextId = (prefix: string) => `${prefix}-${++nodeIdx}`;

  // ─── 1. Start Node ───
  const startId = nextId('start');
  nodes.push({
    id: startId,
    type: 'start',
    position: { x: X_CENTER, y },
    data: { label: 'Start' },
  });
  y += Y_STEP;
  let prevNodeId = startId;

  // ─── 2. Greeting Speak Node ───
  const greetingId = nextId('speak');
  
  // Basic translation mapping based on language, fallback to English
  let greetingText = GREETING_MAP[brief.use_case_type] || GREETING_MAP['Other'];
  greetingText = greetingText.replace(/Hello!|Hi there!|Hi!/, `Hello, welcome to ${brief.business_name}!`);
  
  if (brief.primary_language === 'Hindi') {
    greetingText = `नमस्ते! ${brief.business_name} में आपका स्वागत है। मैं आपकी कैसे मदद कर सकता हूँ?`;
  } else if (brief.primary_language === 'Gujarati') {
    greetingText = `નમસ્તે! ${brief.business_name} માં તમારું સ્વાગત છે. હું તમારી કેવી રીતે મદદ કરી શકું?`;
  }

  nodes.push({
    id: greetingId,
    type: 'speak',
    position: { x: X_CENTER, y },
    data: { text: greetingText },
  });
  edges.push({
    id: `e-${prevNodeId}-${greetingId}`,
    source: prevNodeId,
    target: greetingId,
  });
  y += Y_STEP;
  prevNodeId = greetingId;

  // ─── 3. Key Task Pairs: Speak (instruction) → Listen (capture) ───
  const tasks = brief.key_tasks.length > 0
    ? brief.key_tasks
    : ['Understand the request']; // fallback if no tasks specified

  for (const task of tasks) {
    // Listen node (capture user input for this task)
    const listenId = nextId('listen');
    nodes.push({
      id: listenId,
      type: 'listen',
      position: { x: X_CENTER, y },
      data: {
        timeoutMs: 8000,
        ...(forbiddenTopicsArray.length > 0 ? { forbidden_topics: forbiddenTopicsArray } : {}),
      },
    });
    edges.push({
      id: `e-${prevNodeId}-${listenId}`,
      source: prevNodeId,
      target: listenId,
    });
    y += Y_STEP;
    prevNodeId = listenId;

    // Speak node (task instruction / acknowledgment)
    const speakId = nextId('speak');
    nodes.push({
      id: speakId,
      type: 'speak',
      position: { x: X_CENTER, y },
      data: { text: `Task: ${task}. Got it, let me process that.` },
    });
    edges.push({
      id: `e-${prevNodeId}-${speakId}`,
      source: prevNodeId,
      target: speakId,
    });
    y += Y_STEP;
    prevNodeId = speakId;
  }

  // ─── 4. Objection Handling (if enabled) ───
  if (brief.handle_objections) {
    // Decision node: "Any concerns?"
    const decisionId = nextId('decision');
    nodes.push({
      id: decisionId,
      type: 'decision',
      position: { x: X_CENTER, y },
      data: {
        name: 'Check for objections',
        systemPrompt: 'Determine if the user has any objections or concerns about proceeding.',
        fallbackTargetId: undefined,
      },
    });
    edges.push({
      id: `e-${prevNodeId}-${decisionId}`,
      source: prevNodeId,
      target: decisionId,
    });
    y += Y_STEP;

    // Branch YES → closing speak → end
    const closingSpeakId = nextId('speak');
    nodes.push({
      id: closingSpeakId,
      type: 'speak',
      position: { x: X_CENTER - 180, y },
      data: { text: 'Wonderful! Everything is confirmed. Thank you for your time, and have a great day!' },
    });
    edges.push({
      id: `e-${decisionId}-${closingSpeakId}`,
      source: decisionId,
      sourceHandle: 'yes',
      target: closingSpeakId,
      data: {
        conditions: [{ id: 'cond-yes', type: 'intent' as const, operator: 'equals' as const, value: 'confirm' }],
      },
    });

    // Branch NO/OBJECTION → objection-handling speak → retry listen → end
    const objSpeakId = nextId('speak');
    nodes.push({
      id: objSpeakId,
      type: 'speak',
      position: { x: X_CENTER + 180, y },
      data: { text: 'I completely understand your concern. Let me address that for you.' },
    });
    edges.push({
      id: `e-${decisionId}-${objSpeakId}`,
      source: decisionId,
      sourceHandle: 'no',
      target: objSpeakId,
      data: {
        conditions: [{ id: 'cond-no', type: 'intent' as const, operator: 'equals' as const, value: 'objection' }],
      },
    });
    y += Y_STEP;

    const retryListenId = nextId('listen');
    nodes.push({
      id: retryListenId,
      type: 'listen',
      position: { x: X_CENTER + 180, y },
      data: {
        timeoutMs: 10000,
        ...(forbiddenTopicsArray.length > 0 ? { forbidden_topics: forbiddenTopicsArray } : {}),
      },
    });
    edges.push({
      id: `e-${objSpeakId}-${retryListenId}`,
      source: objSpeakId,
      target: retryListenId,
    });
    y += Y_STEP;

    // End nodes for both branches
    const endYesId = nextId('end');
    nodes.push({
      id: endYesId,
      type: 'end',
      position: { x: X_CENTER - 180, y: y - Y_STEP },
      data: { label: 'End (Confirmed)' },
    });
    edges.push({
      id: `e-${closingSpeakId}-${endYesId}`,
      source: closingSpeakId,
      target: endYesId,
    });

    const endNoId = nextId('end');
    nodes.push({
      id: endNoId,
      type: 'end',
      position: { x: X_CENTER + 180, y },
      data: { label: 'End (Objection Handled)' },
    });
    edges.push({
      id: `e-${retryListenId}-${endNoId}`,
      source: retryListenId,
      target: endNoId,
    });

  } else {
    // ─── No objection handling: simple closing → end ───
    const closingSpeakId = nextId('speak');
    nodes.push({
      id: closingSpeakId,
      type: 'speak',
      position: { x: X_CENTER, y },
      data: { text: `Thank you for your time! Is there anything else I can help you with?` },
    });
    edges.push({
      id: `e-${prevNodeId}-${closingSpeakId}`,
      source: prevNodeId,
      target: closingSpeakId,
    });
    y += Y_STEP;
    prevNodeId = closingSpeakId;

    const endId = nextId('end');
    nodes.push({
      id: endId,
      type: 'end',
      position: { x: X_CENTER, y },
      data: { label: 'End' },
    });
    edges.push({
      id: `e-${prevNodeId}-${endId}`,
      source: prevNodeId,
      target: endId,
    });
  }

  return { nodes, edges };
}

/* ──────────────────────────────────────────────
   POST HANDLER
   ────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session: _s } } = await supabase.auth.getSession();
  const user = _s?.user ?? null;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    const {
      business_name,
      industry,
      primary_language,
      agent_gender,
      use_case_type,
      use_case_description,
      key_tasks,
      tone,
      strictness_level,
      handle_objections,
      forbidden_topics,
      contact_memory_enabled,
      contact_fields,
    } = body;

    // Validate required fields
    if (!business_name || !industry || !primary_language || !agent_gender ||
        !use_case_type || !use_case_description || !tone || strictness_level == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Fetch the Base Template for config defaults
    const { data: templates, error: templateError } = await supabase
      .from('agents')
      .select('*')
      .eq('is_template', true)
      .eq('name', 'Base Voice Agent Template')
      .limit(1);

    if (templateError || !templates || templates.length === 0) {
      return NextResponse.json(
        { error: 'Base template not found. Please contact admin.' },
        { status: 500 }
      );
    }

    const baseTemplate = templates[0];
    const baseConfig = baseTemplate.config || {};

    /* ──────────────────────────────────────────────
   GENERATE WORKFLOW STEPS (RUNTIME LLM STEPS)
   Determines the conversational order the LLM follows
   ────────────────────────────────────────────── */

function generateWorkflowSteps(brief: {
  use_case_type: string;
  key_tasks: string[];
  handle_objections: boolean;
}): any[] {
  const steps: any[] = [];
  
  // 1. Greeting
  steps.push({
    name: 'Greeting & Intro',
    description: `Deliver the standard greeting for ${brief.use_case_type}. Make sure the user is ready to speak before proceeding.`
  });

  // 2. Key Tasks
  const tasks = brief.key_tasks.length > 0 ? brief.key_tasks : ['Assist the user with their request'];
  tasks.forEach((task, index) => {
    steps.push({
      name: `Core Task ${index + 1}`,
      description: task,
    });
  });

  // 3. Objection Handling
  if (brief.handle_objections) {
    steps.push({
      name: 'Handle Objections',
      description: 'Check if the user has any remaining concerns. Address them logically. Be empathetic and clear.',
    });
  }

  // 4. Wrap up
  steps.push({
    name: 'Wrap up',
    description: 'Thank the user for their time, confirm next steps if any, and end the conversation naturally.'
  });

  return steps;
}

// ─── BUG 1 FIX: Parse forbidden topics into an array for config ───
    const forbiddenTopicsArray = parseForbiddenTopics(forbidden_topics);

    // ─── WORKFLOW STEPS: Generate the conversational steps for the backend agent ───
    const dynamicWorkflowSteps = generateWorkflowSteps({
      use_case_type,
      key_tasks: key_tasks || [],
      handle_objections: handle_objections || false,
    });

    // 2. Build agent config from brief + base template
    const agentConfig = {
      ...baseConfig,
      language: LANGUAGE_MAP[primary_language] || 'en',
      voice_gender: agent_gender.toLowerCase(),
      tts: {
        ...baseConfig.tts,
        voice: VOICE_MAP[agent_gender] || baseConfig.tts?.voice,
      },
      system_prompt: generateSystemPrompt({
        business_name,
        use_case_type,
        use_case_description,
        key_tasks: key_tasks || [],
        tone,
        strictness_level,
        handle_objections: handle_objections || false,
        forbidden_topics,
      }),
      // Inject dynamically generated steps instead of base template steps
      workflow_steps: dynamicWorkflowSteps,
      // ─── BUG 1 FIX: Store forbidden topics as structured array in config ───
      forbidden_topics: forbiddenTopicsArray,
      contact_memory_enabled,
      contact_fields,
    };

    // ─── BUG 2 FIX: Generate workflow_schema from brief inputs ───
    const workflowSchema = generateWorkflowSchema({
      use_case_type,
      key_tasks: key_tasks || [],
      handle_objections: handle_objections || false,
      forbidden_topics,
      business_name,
      primary_language,
    });

    // 3. Create the agent row with workflow_schema
    const { data: newAgent, error: agentError } = await supabase
      .from('agents')
      .insert({
        user_id: user.id,
        name: `${business_name} - ${use_case_type} Agent`,
        description: use_case_description.substring(0, 200),
        is_template: false,
        cloned_from: baseTemplate.id,
        config: agentConfig,
        workflow_schema: workflowSchema,
      })
      .select()
      .single();

    if (agentError || !newAgent) {
      console.error('Agent creation error:', agentError);
      return NextResponse.json(
        { error: agentError?.message || 'Failed to create agent' },
        { status: 500 }
      );
    }

    // 4. Create the brief row linked to the new agent
    const { data: newBrief, error: briefError } = await supabase
      .from('agent_briefs')
      .insert({
        user_id: user.id,
        agent_id: newAgent.id,
        business_name,
        industry,
        primary_language,
        agent_gender,
        use_case_type,
        use_case_description,
        key_tasks: key_tasks || [],
        tone,
        strictness_level,
        handle_objections: handle_objections || false,
        forbidden_topics: forbidden_topics || null,
        contact_memory_enabled,
        contact_fields: contact_fields || ['Name', 'Phone'],
      })
      .select()
      .single();

    if (briefError) {
      console.error('Brief creation error:', briefError);
      // Ensure agent deletes if brief creation fails for any reason? Or just log?
      // Agent was already created, don't fail the whole request
    }

    // Now update agent with brief_id
    if (newBrief) {
      await supabase.from('agents').update({ brief_id: newBrief.id }).eq('id', newAgent.id);
    }

    return NextResponse.json({
      agentId: newAgent.id,
      briefId: newBrief?.id || null,
      redirect: '/dashboard',
    });

  } catch (err: any) {
    console.error('Brief API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
