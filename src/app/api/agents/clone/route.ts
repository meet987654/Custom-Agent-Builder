import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { session: _s } } = await supabase.auth.getSession(); const user = _s?.user ?? null;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, clientName } = await req.json();

    if (!name || !clientName) {
        return NextResponse.json({ error: 'Name and Client Name are required' }, { status: 400 });
    }

    // 1. Fetch the Base Template
    const { data: templates, error: templateError } = await supabase
        .from('agents')
        .select('*')
        .eq('is_template', true)
        .eq('name', 'Base Voice Agent Template')
        .limit(1);

    if (templateError || !templates || templates.length === 0) {
        return NextResponse.json({ error: 'Base template not found. Please contact admin.' }, { status: 500 });
    }

    const baseTemplate = templates[0];

    // 2. Clone it
    // Modify config or description if needed based on input
    const newConfig = { ...baseTemplate.config };
    // e.g., inject client name into system prompt? 
    // Section 2 Step 1 says: "Immediately lands on the edit page with all defaults pre-filled."
    // So we just copy the config.

    const { data: newAgent, error: createError } = await supabase
        .from('agents')
        .insert({
            user_id: user.id,
            name: `${clientName} - ${name}`,
            description: `Voice agent for ${clientName}`,
            is_template: false,
            cloned_from: baseTemplate.id,
            config: newConfig,
        })
        .select()
        .single();

    if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json({ agentId: newAgent.id, redirect: `/agent/${newAgent.id}` });
}
