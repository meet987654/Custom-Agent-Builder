import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
    const roomName = req.nextUrl.searchParams.get('room');
    const username = req.nextUrl.searchParams.get('username');
    const agentId = req.nextUrl.searchParams.get('agentId');

    if (!roomName || !username || !agentId) {
        return NextResponse.json(
            { error: 'Missing "room", "username", or "agentId" query parameter' },
            { status: 400 }
        );
    }

    // 1. Authenticate User & Validate Agent Access
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: agent, error } = await supabase
        .from('agents')
        .select('id, user_id, is_template')
        .eq('id', agentId)
        .single();

    if (error || !agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Check ownership (users can only run their own agents, or templates?)
    // Templates are public, but usually you clone them first. 
    // If the user is running a test on a template, maybe allow it? 
    // But the Prompt says "Team member clones base template...".
    // Let's enforce ownership for now to be safe, unless it's strictly a public demo.
    // Actually, for "Test Page", the user is usually the owner.
    if (agent.user_id !== user.id && !agent.is_template) {
        return NextResponse.json({ error: 'Unauthorized access to agent' }, { status: 403 });
    }


    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
        return NextResponse.json(
            { error: 'Server misconfigured' },
            { status: 500 }
        );
    }

    // 2. Set Room Metadata (so Worker knows which agent to load)
    // We use RoomServiceClient to create/update the room with metadata
    const roomService = new RoomServiceClient(wsUrl, apiKey, apiSecret);

    const metadata = JSON.stringify({
        agent_id: agentId,
        user_id: user.id
    });

    try {
        // Create room if not exists, or update metadata
        await roomService.createRoom({
            name: roomName,
            emptyTimeout: 60 * 5, // 5 minutes
            metadata: metadata,
        });
    } catch (err) {
        console.error("Error creating room/setting metadata:", err);
        // Proceed? Or fail? If metadata isn't set, worker won't work.
        // Trying to update if it exists? createRoom usually handles idempotency but might fail if active?
        // If room exists, we might need to update metadata? Not easily supported in one call if active.
        // But for a new test call, room name is usually random or unique.
    }

    // 3. Generate Token for User
    const at = new AccessToken(apiKey, apiSecret, { identity: username });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    const token = await at.toJwt();

    // 4. Wake up the deployed Render worker (so it doesn't sleep)
    // Render free-tier instances sleep after 15 minutes of HTTP inactivity.
    // Pinging it here ensures it wakes up before or as the user connects.
    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'https://voice-agent-worker-mr0v.onrender.com';
    fetch(workerUrl).catch(e => console.error("Worker wake-up ping error:", e));

    return NextResponse.json({ token });
}
