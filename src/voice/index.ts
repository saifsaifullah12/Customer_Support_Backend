import { ElevenLabsVoiceProvider } from "@voltagent/voice";

if (!process.env.ELEVENLABS_API_KEY) {
  throw new Error("ELEVENLABS_API_KEY is missing in .env!");
}

export const voiceProvider = new ElevenLabsVoiceProvider({
  apiKey: process.env.ELEVENLABS_API_KEY,
  ttsModel: "eleven_multilingual_v2",
  voice: "Rachel",
});
