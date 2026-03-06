import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient();
    const { data: { session: _s } } = await supabase.auth.getSession(); const user = _s?.user ?? null;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data: agent, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Check ownership
    if (agent.user_id !== user.id && !agent.is_template) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({ agent });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient();
    const { data: { session: _s } } = await supabase.auth.getSession(); const user = _s?.user ?? null;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const updates = await req.json();

    // Validate agent ownership before update
    const { data: existingAgent, error: fetchError } = await supabase
        .from('agents')
        .select('user_id')
        .eq('id', id)
        .single();

    if (fetchError || !existingAgent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (existingAgent.user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: updatedAgent, error } = await supabase
        .from('agents')
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agent: updatedAgent });
}
