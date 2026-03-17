import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import fs from "fs";
import { transcribeAudio } from "../../lib/whisper.js";

export const transcribeAudioTool = tool(
  "transcribe_audio",
  "Transcribe an audio file to text using Whisper. Supports mp3, wav, ogg, m4a, webm, and other common audio formats.",
  {
    filePath: z.string().describe("Absolute path to the audio file"),
  },
  async (args) => {
    try {
      if (!fs.existsSync(args.filePath)) {
        return { content: [{ type: "text" as const, text: `Error: File not found: ${args.filePath}` }] };
      }

      const result = await transcribeAudio(args.filePath);
      return { content: [{ type: "text" as const, text: result.text || "(No speech detected)" }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error transcribing audio: ${err.message}` }] };
    }
  }
);
