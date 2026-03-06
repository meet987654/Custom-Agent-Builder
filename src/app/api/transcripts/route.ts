import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    // Initialize Supabase Admin client lazily (inside handler) so it runs at
    // request time — not at build time when env vars aren't available on Vercel.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: 'Server misconfigured: missing Supabase credentials' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Verify Authentication
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const {
            agent_id,
            user_id,
            session_id,
            duration_seconds,
            transcript_json,
            metadata
        } = body;

        if (!agent_id || !transcript_json) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 2. Insert into DB
        const { data, error } = await supabase
            .from('transcripts')
            .insert({
                agent_id,
                user_id, // can be null for anonymous? But usually from worker metadata
                session_id,
                duration_seconds,
                transcript_json,
                metadata
            })
            .select()
            .single();

        if (error) {
            console.error('Database Insertion Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, id: data.id });

    } catch (err: any) {
        console.error('Transcript API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
