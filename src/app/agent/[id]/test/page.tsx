'use client';

import {
    LiveKitRoom,
    RoomAudioRenderer,
    StartAudio,
    useConnectionState,
    useVoiceAssistant,
    BarVisualizer,
    useLocalParticipant,
    DisconnectButton,
    TrackReferenceOrPlaceholder,
    useTracks,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import { useCallback, useEffect, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, X, Activity } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function VoiceTestPage({ params }: { params: { id: string } }) {
    // In Next.js 15, params is passed as a Promise?
    // Let's assume we handle unwrapping or use client hook if needed.
    // Actually, for client components, standard props work if Layout passed nicely.
    // But safest is:
    const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);

    useEffect(() => {
        // If params is a promise, resolve it. 
        // Typescript might complain if we treat it as object directly if types say Promise.
        // Let's assume standard behavior for now: object.
        // If it breaks, we fix.
        Promise.resolve(params).then(p => setResolvedParams(p));
    }, [params]);

    if (!resolvedParams) return <div className="flex h-screen items-center justify-center bg-black text-gray-500">Loading route...</div>;

    return <TokenWrapper agentId={resolvedParams.id} />;
}

function TokenWrapper({ agentId }: { agentId: string }) {
    const [token, setToken] = useState<string>('');
    const [url, setUrl] = useState<string>('');
    const [canConnect, setCanConnect] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState<string>('');

    const handleConnect = async () => {
        setIsFetching(true);
        setError('');
        try {
            const username = `test_user_${Math.floor(Math.random() * 10000)}`;
            const roomName = `test_room_${agentId}_${Date.now()}`;

            // Fetch from our API
            const res = await fetch(`/api/livekit/token?room=${roomName}&username=${username}&agentId=${agentId}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            setToken(data.token);
            setUrl(process.env.NEXT_PUBLIC_LIVEKIT_URL!);
            setCanConnect(true);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsFetching(false);
        }
    };

    if (error) return <div className="flex h-screen items-center justify-center bg-black text-red-500">Error: {error}</div>;

    return (
        <LiveKitRoom
            token={token || 'placeholder'} // LiveKitRoom requires a string token, even if disconnected initially
            serverUrl={url || 'wss://placeholder.net'}
            connect={canConnect}
            audio={true}
            video={false}
            data-lk-theme="default"
            className="flex h-screen w-full flex-col bg-black font-sans text-white"
            onDisconnected={() => {
                setCanConnect(false);
                setToken(''); // Reset token so it forces a new start next time
            }}
        >
            <TestInterface
                agentId={agentId}
                isConnected={canConnect}
                isFetching={isFetching}
                onConnect={handleConnect}
                onDisconnect={() => setCanConnect(false)}
            />
        </LiveKitRoom>
    );
}

function TestInterface({
    agentId,
    isConnected,
    isFetching,
    onConnect,
    onDisconnect
}: {
    agentId: string,
    isConnected: boolean,
    isFetching: boolean,
    onConnect: () => void,
    onDisconnect: () => void
}) {
    const connectionState = useConnectionState();
    const { state: agentState, audioTrack: agentAudioTrack } = useVoiceAssistant();
    // agentState: 'listening' | 'thinking' | 'speaking' | 'idle'

    const router = useRouter();
    const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();

    // Find Agent Track for Visualizer
    const tracks = useTracks([Track.Source.Microphone]);
    const agentTrackRef = tracks.find(
        (t) => t.participant?.identity && t.participant.identity !== localParticipant?.identity
    );

    return (
        <div className="relative flex h-full flex-col bg-gray-950 text-white">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/50 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <div className={`h-3 w-3 rounded-full ${isConnected && connectionState === ConnectionState.Connected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                    <div>
                        <h1 className="text-sm font-bold tracking-wide">Voice Test Environment</h1>
                        <p className="text-xs text-gray-400">Agent ID: <span className="font-mono text-gray-500">{agentId.slice(0, 8)}...</span></p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        if (isConnected) onDisconnect();
                        // Slight delay to allow LiveKit to process the disconnect in React state
                        setTimeout(() => router.push(`/agent/${agentId}`), 50);
                    }}
                    className="rounded-full bg-gray-800 p-2 text-gray-400 transition hover:bg-gray-700 hover:text-white"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Main Visualizer Area */}
            <div className="relative flex flex-1 flex-col items-center justify-center p-8">

                {/* Status Indicator */}
                <div className="mb-12 transition-all duration-300">
                    {isConnected && connectionState === ConnectionState.Connected ? (
                        <div className="animation-pulse flex flex-col items-center gap-2">
                            <span className={`text-2xl font-light tracking-widest ${agentState === 'speaking' ? 'text-indigo-400' :
                                agentState === 'listening' ? 'text-green-400' : 'text-gray-500'
                                }`}>
                                {agentState === 'speaking' ? 'SPEAKING' :
                                    agentState === 'listening' ? 'LISTENING' :
                                        agentState === 'thinking' ? 'THINKING...' : 'IDLE'}
                            </span>
                        </div>
                    ) : (
                        <div className="text-gray-600">Disconnected</div>
                    )}
                </div>

                {/* Circle Visualizer */}
                <div className={`relative flex h-64 w-64 items-center justify-center rounded-full border border-gray-800 bg-gray-900 transition-all duration-500 ${agentState === 'speaking' ? 'shadow-[0_0_60px_rgba(99,102,241,0.3)] ring-1 ring-indigo-500/20' : ''
                    }`}>

                    {isConnected && agentTrackRef && (
                        <BarVisualizer
                            state={agentState}
                            trackRef={agentTrackRef}
                            barCount={5}
                            options={{ minHeight: 20, maxHeight: 100 }}
                            className="absolute inset-0 h-full w-full opacity-80"
                        />
                    )}

                    {/* Center Icon */}
                    <div className="z-10 text-gray-700">
                        {agentState === 'speaking' ? <Activity size={48} className="text-indigo-500" /> : <Mic size={48} />}
                    </div>
                </div>

            </div>

            {/* Controls Bar */}
            <div className="border-t border-gray-800 bg-gray-900 p-8">
                <div className="mx-auto flex max-w-md items-center justify-center gap-12">

                    {/* Mic Status */}
                    <div className="flex flex-col items-center gap-2 text-gray-500">
                        <div className={`rounded-full p-3 ${isMicrophoneEnabled ? 'bg-gray-800 text-green-500' : 'bg-gray-800 text-red-500'}`}>
                            {isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                        </div>
                        <span className="text-[10px] font-medium uppercase tracking-wider">Mic</span>
                    </div>

                    {/* Main Call Button */}
                    {!isConnected ? (
                        <button
                            onClick={onConnect}
                            disabled={isFetching}
                            className={`group relative flex h-20 w-20 items-center justify-center rounded-full shadow-xl transition-all ${isFetching ? 'bg-gray-600 opacity-50 cursor-not-allowed' : 'bg-green-600 hover:scale-105 hover:bg-green-500 hover:shadow-green-500/30 active:scale-95'}`}
                        >
                            <Phone size={36} className="fill-white text-white drop-shadow-md" />
                            <span className="absolute -bottom-8 w-max text-xs font-bold uppercase tracking-wider text-green-500 opacity-0 transition-opacity group-hover:opacity-100">
                                {isFetching ? 'Connecting...' : 'Start Call'}
                            </span>
                        </button>
                    ) : (
                        <button
                            onClick={onDisconnect}
                            className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-red-600 shadow-xl transition-all hover:scale-105 hover:bg-red-500 hover:shadow-red-500/30 active:scale-95"
                        >
                            <PhoneOff size={36} className="fill-white text-white drop-shadow-md" />
                            <span className="absolute -bottom-8 w-max text-xs font-bold uppercase tracking-wider text-red-500 opacity-0 transition-opacity group-hover:opacity-100">End Call</span>
                        </button>
                    )}

                    {/* Transcript Toggle (Placeholder) */}
                    <div className="flex flex-col items-center gap-2 text-gray-500">
                        <button className="rounded-full bg-gray-800 p-3 hover:bg-gray-700 hover:text-white">
                            <Activity size={20} />
                        </button>
                        <span className="text-[10px] font-medium uppercase tracking-wider">Log</span>
                    </div>

                </div>

                {/* Technical Footer */}
                <div className="mt-8 text-center text-[10px] text-gray-600">
                    Latency: 45ms (simulated) • Provider: Deepgram/Gemini/Cartesia
                </div>
            </div>

            <RoomAudioRenderer />
            <StartAudio label="Click to allow audio playback" />
        </div>
    );
}
