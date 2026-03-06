import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import AgentEditForm from '@/components/AgentEditForm';

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { id } = await params;

    // Parallel fetch: Agent & User's API Keys
    const [agentRes, keysRes] = await Promise.all([
        supabase.from('agents').select('*').eq('id', id).single(),
        supabase.from('api_keys').select('provider').eq('user_id', user.id).eq('is_active', true)
    ]);

    const agent = agentRes.data;
    const userKeys = keysRes.data || [];

    if (agentRes.error || !agent) {
        notFound();
    }

    // Check ownership
    if (agent.user_id !== user.id && !agent.is_template) {
        redirect('/dashboard');
    }

    // Transform keys to a Set or map for easy lookup
    const configuredProviders = userKeys.map((k: { provider: string }) => k.provider);

    return (
        <div className="min-h-screen bg-gray-950 p-8 text-white">
            <div className="mx-auto max-w-7xl">
                <AgentEditForm agent={agent} configuredProviders={configuredProviders} />
            </div>
        </div>
    );
}
