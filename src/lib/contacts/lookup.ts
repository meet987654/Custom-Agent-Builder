import { createClient } from '@supabase/supabase-js';

// Worker environment requires direct URL/KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

export interface Contact {
    id: string;
    agent_id: string;
    phone_number: string;
    name: string | null;
    custom_data: Record<string, any>;
    first_seen_at: string;
    last_seen_at: string;
    total_calls: number;
}

export async function lookupCaller(agentId: string, phoneNumber: string): Promise<Contact | null> {
    if (!agentId || !phoneNumber) return null;
    
    const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('agent_id', agentId)
        .eq('phone_number', phoneNumber)
        .maybeSingle();

    if (error) {
        console.error('[CONTACTS] Lookup error:', error);
        return null;
    }
    return data;
}

export async function upsertCaller(
    agentId: string,
    phoneNumber: string,
    data: Partial<Contact>
): Promise<Contact | null> {
    if (!agentId || !phoneNumber) return null;
    
    const existing = await lookupCaller(agentId, phoneNumber);

    if (existing) {
        // Update
        const updatedCustomData = { ...existing.custom_data, ...(data.custom_data || {}) };
        const { data: updated, error } = await supabase
            .from('contacts')
            .update({
                name: data.name || existing.name,
                custom_data: updatedCustomData,
                last_seen_at: new Date().toISOString(),
                total_calls: existing.total_calls + 1
            })
            .eq('id', existing.id)
            .select()
            .single();

        if (error) {
            console.error('[CONTACTS] Upsert update error:', error);
            throw error;
        }
        return updated;
    } else {
        // Insert
        const { data: inserted, error } = await supabase
            .from('contacts')
            .insert({
                agent_id: agentId,
                phone_number: phoneNumber,
                name: data.name || null,
                custom_data: data.custom_data || {},
                total_calls: 1,
            })
            .select()
            .single();

        if (error) {
            console.error('[CONTACTS] Upsert insert error:', error);
            throw error;
        }
        return inserted;
    }
}
