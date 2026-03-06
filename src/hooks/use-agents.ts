'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

export function useAgents() {
    const [agents, setAgents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        async function fetchAgents() {
            try {
                const { data, error } = await supabase
                    .from('agents')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) {
                    setError(error.message);
                } else {
                    setAgents(data || []);
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchAgents();
    }, []);

    const createAgent = async (name: string, clientName: string) => {
        // Call the clone route
        try {
            const res = await fetch('/api/agents/clone', {
                method: 'POST',
                body: JSON.stringify({ name, clientName }),
                headers: { 'Content-Type': 'application/json' }
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to create agent');
            }

            const data = await res.json();
            return data; // { agentId, redirect }
        } catch (err: any) {
            setError(err.message);
            throw err;
        }
    };

    return { agents, loading, error, createAgent };
}
