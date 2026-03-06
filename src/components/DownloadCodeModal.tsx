'use client';

import { useState } from 'react';
import { X, Code, Terminal, FileCode, Check } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface DownloadCodeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agentId: string;
    agentName: string;
}

export function DownloadCodeModal({ open, onOpenChange, agentId, agentName }: DownloadCodeModalProps) {
    const [downloading, setDownloading] = useState<string | null>(null);

    const handleDownload = async (lang: 'nodejs' | 'python') => {
        setDownloading(lang);
        try {
            // Trigger download via window location or hidden link
            const url = `/api/agents/${agentId}/export-code?lang=${lang}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = `${agentName.replace(/\s+/g, '-')}-${lang}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Close modal shortly after
            setTimeout(() => {
                setDownloading(null);
                onOpenChange(false);
            }, 1000);
        } catch (e) {
            console.error(e);
            setDownloading(null);
        }
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
                <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-2xl focus:outline-none">

                    <div className="mb-4 flex items-center justify-between">
                        <Dialog.Title className="text-xl font-semibold text-white">Download Agent as Code</Dialog.Title>
                        <Dialog.Close asChild>
                            <button className="rounded-full p-1 text-gray-400 hover:bg-gray-800 hover:text-white">
                                <X size={20} />
                            </button>
                        </Dialog.Close>
                    </div>

                    <Dialog.Description className="mb-6 text-sm text-gray-400">
                        Choose your preferred language stack. Both versions provide identical behavior and include your full configuration.
                    </Dialog.Description>

                    <div className="grid gap-4 md:grid-cols-2">

                        {/* Node.js Card */}
                        <button
                            onClick={() => handleDownload('nodejs')}
                            disabled={!!downloading}
                            className="group relative flex flex-col rounded-lg border border-gray-800 bg-gray-900/50 p-4 transition-all hover:border-yellow-500/50 hover:bg-gray-900 text-left disabled:opacity-50"
                        >
                            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded bg-yellow-500/10 text-yellow-500">
                                <Terminal size={20} />
                            </div>
                            <h3 className="mb-1 font-semibold text-white group-hover:text-yellow-400">Node.js</h3>
                            <p className="text-xs text-gray-400 mb-4">TypeScript • @livekit/agents</p>
                            <div className="mt-auto text-[10px] text-gray-500 font-mono bg-gray-950/50 px-2 py-1 rounded w-fit">
                                npm install && npm run dev
                            </div>
                            {downloading === 'nodejs' && (
                                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-950/80 backdrop-blur-sm">
                                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-yellow-500 border-t-transparent"></div>
                                </div>
                            )}
                        </button>

                        {/* Python Card */}
                        <button
                            onClick={() => handleDownload('python')}
                            disabled={!!downloading}
                            className="group relative flex flex-col rounded-lg border border-gray-800 bg-gray-900/50 p-4 transition-all hover:border-blue-500/50 hover:bg-gray-900 text-left disabled:opacity-50"
                        >
                            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded bg-blue-500/10 text-blue-500">
                                <FileCode size={20} />
                                {/* Python icon replacement */}
                            </div>
                            <h3 className="mb-1 font-semibold text-white group-hover:text-blue-400">Python</h3>
                            <p className="text-xs text-gray-400 mb-4">Python 3.11+ • livekit-agents</p>
                            <div className="mt-auto text-[10px] text-gray-500 font-mono bg-gray-950/50 px-2 py-1 rounded w-fit">
                                pip install -r requirements.txt
                            </div>
                            {downloading === 'python' && (
                                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-950/80 backdrop-blur-sm">
                                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
                                </div>
                            )}
                        </button>
                    </div>

                    <div className="mt-6 rounded border border-yellow-500/20 bg-yellow-500/5 p-3">
                        <p className="text-xs text-yellow-500 flex gap-2">
                            <span className="font-bold">Note:</span>
                            API keys are defined in your secure vault and are NOT included in the download. You will need to add them to a .env file locally.
                        </p>
                    </div>

                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
