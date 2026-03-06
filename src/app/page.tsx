import Link from 'next/link';
import { ArrowRight, MessageSquare, Shield, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { session: _s } } = await supabase.auth.getSession(); const user = _s?.user ?? null;
  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Navigation */}
      <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-gray-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <MessageSquare size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">VoiceAgent.ai</span>
          </div>
          <div className="flex items-center gap-6">
            {user ? (
              <>
                <SignOutButton />
                <Link
                  href="/dashboard"
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
                >
                  Go to Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-300 hover:text-white"
                >
                  Log in
                </Link>
                <Link
                  href="/login"
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pt-32 text-center">
        <div className="mb-8 inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-400">
          <span className="mr-2 h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
          Now Live in Beta
        </div>

        <h1 className="mb-6 max-w-4xl text-5xl font-extrabold tracking-tight sm:text-7xl bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent">
          Build Intelligent Voice Agents in Minutes
        </h1>

        <p className="mb-10 max-w-2xl text-lg text-gray-400 sm:text-xl">
          Create, test, and deploy ultra-low latency conversational AI agents.
          Powered by LiveKit, OpenAI, Deepgram, and more.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/dashboard"
            className="group flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-indigo-500 hover:scale-105"
          >
            Start Building Free
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <a
            href="https://docs.livekit.io/agents"
            target="_blank"
            className="flex items-center justify-center gap-2 rounded-full border border-gray-700 bg-gray-900 px-8 py-4 text-base font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
          >
            Read Documentation
          </a>
        </div>

        {/* Features Grid */}
        <div className="mt-24 grid max-w-5xl gap-8 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6 text-left hover:border-indigo-500/30 transition-colors">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
              <Zap size={20} />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-white">Low Latency</h3>
            <p className="text-sm text-gray-400">Real-time &lt;500ms voice interactions powered by WebRTC and edge computing.</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6 text-left hover:border-indigo-500/30 transition-colors">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
              <Shield size={20} />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-white">Secure by Design</h3>
            <p className="text-sm text-gray-400">Enterprise-grade API key management with AES-256 encryption at rest.</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6 text-left hover:border-indigo-500/30 transition-colors">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
              <MessageSquare size={20} />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-white">Visual Builder</h3>
            <p className="text-sm text-gray-400">Drag-and-drop workflow builder. No coding required to get started.</p>
          </div>
        </div>
      </main>

      <footer className="mt-20 border-t border-gray-800 py-8 text-center text-sm text-gray-500">
        <div className="mx-auto max-w-7xl px-6 flex justify-between items-center">
          <p>© 2024 VoiceAgent Builder. All rights reserved.</p>
          <p>Powered by Next.js & LiveKit</p>
        </div>
      </footer>
    </div>
  );
}
