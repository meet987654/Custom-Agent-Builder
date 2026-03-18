'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Phone, ArrowLeft, Trash2, Edit, Calendar } from 'lucide-react';
import { maskPhone } from '@/lib/utils/phone';

export default function ContactsClient({ 
    agentId, 
    agentName, 
    initialContacts 
}: { 
    agentId: string, 
    agentName: string, 
    initialContacts: any[] 
}) {
    const router = useRouter();
    const [contacts, setContacts] = useState(initialContacts);
    const [search, setSearch] = useState('');
    const [selectedContact, setSelectedContact] = useState<any>(null);

    const filteredContacts = contacts.filter(c => 
        (c.name && c.name.toLowerCase().includes(search.toLowerCase())) || 
        (c.phone_number && c.phone_number.includes(search))
    );

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Delete this contact? This cannot be undone.')) return;
        
        try {
            const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            setContacts(contacts.filter(c => c.id !== id));
            if (selectedContact?.id === id) setSelectedContact(null);
        } catch (err) {
            alert('Failed to delete contact');
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push(`/agent/${agentId}`)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold">Contacts</h1>
                        <p className="text-sm text-gray-400">{agentName} • {contacts.length} total</p>
                    </div>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input
                        type="text"
                        placeholder="Search name or phone..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="rounded-lg bg-gray-900 border border-gray-800 py-2 pl-9 pr-4 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
            </div>

            <div className="flex gap-6">
                <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="bg-gray-950 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase">
                                <tr>
                                    <th className="px-6 py-4">Name</th>
                                    <th className="px-6 py-4">Phone</th>
                                    <th className="px-6 py-4">Calls</th>
                                    <th className="px-6 py-4">Last Seen</th>
                                    <th className="px-6 py-4">Data</th>
                                    <th className="px-6 py-4"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredContacts.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                            No contacts found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredContacts.map((contact) => (
                                        <tr 
                                            key={contact.id}
                                            onClick={() => setSelectedContact(contact)}
                                            className={`border-b border-gray-800/50 cursor-pointer transition-colors ${selectedContact?.id === contact.id ? 'bg-indigo-900/20' : 'hover:bg-gray-800/50'}`}
                                        >
                                            <td className="px-6 py-4 font-medium text-white">{contact.name || 'Unknown'}</td>
                                            <td className="px-6 py-4 font-mono text-xs">{maskPhone(contact.phone_number)}</td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-xs font-medium">
                                                    {contact.total_calls}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-400">
                                                {new Date(contact.last_seen_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="truncate max-w-[150px] inline-block text-xs text-gray-500">
                                                    {Object.keys(contact.custom_data || {}).length > 0 
                                                        ? JSON.stringify(contact.custom_data).slice(0, 30) + '...'
                                                        : '—'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={(e) => handleDelete(contact.id, e)}
                                                    className="text-gray-500 hover:text-red-400 transition-colors p-1"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {selectedContact && (
                    <div className="w-80 shrink-0 rounded-xl border border-gray-800 bg-gray-900 p-6 flex flex-col gap-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white mb-1">{selectedContact.name || 'Unknown Caller'}</h2>
                                <div className="flex items-center gap-2 text-sm text-gray-400 font-mono">
                                    <Phone size={14} />
                                    {maskPhone(selectedContact.phone_number)}
                                </div>
                            </div>
                            <button className="text-gray-500 hover:text-indigo-400">
                                <Edit size={16} />
                            </button>
                        </div>

                        <div className="flex items-center gap-4 border-y border-gray-800 py-4">
                            <div className="flex-1">
                                <span className="block text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">Total Calls</span>
                                <span className="text-lg text-white font-medium">{selectedContact.total_calls}</span>
                            </div>
                            <div className="h-8 w-px bg-gray-800"></div>
                            <div className="flex-1">
                                <span className="block text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">First Seen</span>
                                <div className="flex items-center gap-1.5 text-sm text-gray-300">
                                    <Calendar size={14} className="text-gray-500" />
                                    {new Date(selectedContact.first_seen_at).toLocaleDateString()}
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Custom Data</h3>
                            {Object.keys(selectedContact.custom_data || {}).length === 0 ? (
                                <p className="text-sm text-gray-600 italic">No additional data collected.</p>
                            ) : (
                                <div className="space-y-3">
                                    {Object.entries(selectedContact.custom_data).map(([key, val]) => (
                                        <div key={key}>
                                            <span className="block text-xs text-gray-500 mb-0.5">{key}</span>
                                            <span className="block text-sm text-gray-100 bg-gray-800/50 rounded px-2.5 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                                                {String(val)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
