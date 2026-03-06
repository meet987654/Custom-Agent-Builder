import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import { generateNodeProject } from '@/lib/codegen/nodejs-generator';
import { generatePythonProject } from '@/lib/codegen/python-generator';
import { AgentConfig } from '@/lib/codegen/types';
import { PassThrough, Readable } from 'stream';

// Helper to convert Node stream to Web Stream
function nodeStreamToIterator(stream: Readable) {
    return async function* () {
        for await (const chunk of stream) {
            yield chunk;
        }
    };
}

function iteratorToStream(iterator: any) {
    return new ReadableStream({
        async pull(controller) {
            const { value, done } = await iterator.next();
            if (done) {
                controller.close();
            } else {
                controller.enqueue(value);
            }
        },
    });
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const supabase = await createClient();

    // 1. Auth & Validation
    const { data: { session: _s } } = await supabase.auth.getSession(); const user = _s?.user ?? null;
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: agent, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', params.id)
        .single();

    if (error || !agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // 2. Generate Code
    const searchParams = req.nextUrl.searchParams;
    const lang = searchParams.get('lang') || 'nodejs';

    // Validate ownership
    if (agent.user_id !== user.id && !agent.is_template) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    let fileMap = {};
    if (lang === 'python') {
        fileMap = generatePythonProject(agent as AgentConfig);
    } else {
        fileMap = generateNodeProject(agent as AgentConfig);
    }

    // 3. Zip & Stream
    const archive = archiver('zip', { zlib: { level: 9 } });
    const passThrough = new PassThrough();

    archive.pipe(passThrough);

    // Add files
    Object.entries(fileMap).forEach(([path, content]) => {
        archive.append(content as string, { name: path });
    });

    // Finalize archive (don't await here, it runs in background pushing to stream)
    archive.finalize().catch((err: any) => console.error('Archiver error:', err));

    // Convert Node Stream to Web ReadableStream for Response
    const stream = iteratorToStream(nodeStreamToIterator(passThrough));

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${agent.name.replace(/\s+/g, '-')}-${lang}.zip"`,
        }
    });
}
