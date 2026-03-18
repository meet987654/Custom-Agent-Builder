import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import ContactsClient from './ContactsClient';

export default async function ContactsPage({ params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { id } = await params;

    const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('*')
        .eq('id', id)
        .single();

    if (agentError || !agent) {
        notFound();
    }

    if (agent.user_id !== user.id) {
        redirect('/dashboard');
    }

    const { data: contacts } = await supabase
        .from('contacts')
        .select('*')
        .eq('agent_id', id)
        .order('last_seen_at', { ascending: false });

    return (
        <div className="min-h-screen bg-gray-950 p-8 text-white">
            <div className="mx-auto max-w-7xl">
                <ContactsClient 
                    agentId={id} 
                    agentName={agent.name} 
                    initialContacts={contacts || []} 
                />
            </div>
        </div>
    );
}
