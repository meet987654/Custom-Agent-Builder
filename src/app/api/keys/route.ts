import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { encrypt, decrypt } from '@/lib/encryption';

// POST: Save a new API key
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { session: _s } } = await supabase.auth.getSession(); const user = _s?.user ?? null;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider, key } = await req.json();

    if (!provider || !key || key.length < 5) {
        return NextResponse.json({ error: 'Provider and Key (min 5 chars) are required' }, { status: 400 });
    }

    // 1. Encrypt the key
    const keyEncrypted = encrypt(key.trim());

    // 2. Derive key hint (last 4 chars)
    const keyHint = key.trim().slice(-4);

    // 3. Upsert into api_keys table
    const { data, error } = await supabase
        .from('api_keys')
        .upsert({
            user_id: user.id,
            provider: provider,
            key_encrypted: keyEncrypted,
            key_hint: keyHint,
            is_active: true
        }, { onConflict: 'user_id, provider' })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        key: { id: data.id, provider: data.provider, hint: data.key_hint }
    });
}

// GET: Fetch status of API keys (not the keys themselves!)
export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const { data: { session: _s } } = await supabase.auth.getSession(); const user = _s?.user ?? null;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: keys, error } = await supabase
        .from('api_keys')
        .select('provider, key_hint')
        .eq('user_id', user.id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ keys });
}

// DELETE: Remove an API key
export async function DELETE(req: NextRequest) {
    const supabase = await createClient();
    const { data: { session: _s } } = await supabase.auth.getSession(); const user = _s?.user ?? null;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider } = await req.json();

    if (!provider) {
        return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
    }

    const { error } = await supabase
        .from('api_keys')
        .delete()
        .match({ user_id: user.id, provider });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
