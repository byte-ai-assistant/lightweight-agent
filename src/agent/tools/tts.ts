import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { generateSpeech } from "../../lib/elevenlabs.js";

export const generateSpeechTool = tool(
  "generate_speech",
  "Generate speech audio from text using ElevenLabs TTS. Returns a voice file path. Include the returned [[VOICE:path]] marker in your response so it gets delivered as a voice message.",
  {
    text: z.string().describe("Text to convert to speech"),
    voiceId: z.string().optional().describe("ElevenLabs voice ID (optional)"),
  },
  async (args) => {
    try {
      const result = await generateSpeech(args.text, {
        voiceId: args.voiceId,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `[[VOICE:${result.filePath}]]`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error generating speech: ${err.message}`,
          },
        ],
      };
    }
  }
);
