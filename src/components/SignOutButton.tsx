'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SignOutButton() {
    const router = useRouter();

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        toast.success('Signed out successfully');
        router.push('/');
        router.refresh(); // Ensure server components re-fetch user state
    };

    return (
        <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
        >
            <LogOut size={16} />
            <span>Sign out</span>
        </button>
    );
}
