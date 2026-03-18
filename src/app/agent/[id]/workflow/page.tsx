import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import WorkflowEditor from '@/features/workflow/components/WorkflowEditor';

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { id } = await params;

    const { data: agent, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !agent) {
        notFound();
    }

    // Check ownership
    if (agent.user_id !== user.id && !agent.is_template) {
        redirect('/dashboard');
    }

    return (
        <div className="h-screen w-screen overflow-hidden bg-[#0a0c12]">
            <WorkflowEditor agentId={agent.id} initialSchema={agent.workflow_schema as any} />
        </div>
    );
}
