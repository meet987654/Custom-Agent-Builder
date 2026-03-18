import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership: contact -> agent -> user  
    const { data: contact } = await supabase
        .from('contacts')
        .select('id, agent_id')
        .eq('id', id)
        .single();

    if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const { data: agent } = await supabase
        .from('agents')
        .select('user_id')
        .eq('id', contact.agent_id)
        .single();

    if (!agent || agent.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const { data: contact } = await supabase
        .from('contacts')
        .select('id, agent_id')
        .eq('id', id)
        .single();

    if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const { data: agent } = await supabase
        .from('agents')
        .select('user_id')
        .eq('id', contact.agent_id)
        .single();

    if (!agent || agent.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.custom_data !== undefined) updateData.custom_data = body.custom_data;

    const { data: updated, error } = await supabase
        .from('contacts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(updated);
}
