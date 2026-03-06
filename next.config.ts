import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@livekit/agents',
    '@livekit/agents-plugin-deepgram',
    '@livekit/agents-plugin-openai',
    '@livekit/agents-plugin-silero',
    '@livekit/agents-plugin-cartesia',
    '@livekit/agents-plugin-google',
    '@livekit/agents-plugin-elevenlabs',
    '@livekit/rtc-node',
  ],
};

export default nextConfig;
