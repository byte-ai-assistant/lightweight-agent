import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

const TTS_TMP = path.join(os.tmpdir(), "lightweight-agent-tts");
const DEFAULT_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

function ensureTmpDir() {
  if (!fs.existsSync(TTS_TMP)) {
    fs.mkdirSync(TTS_TMP, { recursive: true });
  }
}

/**
 * Generate speech audio from text using ElevenLabs TTS API.
 * Returns an OGG/Opus file path suitable for Telegram voice messages.
 */
export async function generateSpeech(
  text: string,
  options?: { voiceId?: string; modelId?: string }
): Promise<{ filePath: string; format: "ogg" }> {
  ensureTmpDir();

  const voiceId = options?.voiceId ?? DEFAULT_VOICE_ID;
  const modelId = options?.modelId ?? DEFAULT_MODEL_ID;
  const apiKey = process.env.ELEVEN_LABS_API_KEY;

  if (!apiKey) {
    throw new Error("ELEVEN_LABS_API_KEY is not set");
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
  }

  const timestamp = Date.now();
  const mp3Path = path.join(TTS_TMP, `${timestamp}.mp3`);
  const oggPath = path.join(TTS_TMP, `${timestamp}.ogg`);

  try {
    // Save MP3 response to temp file
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(mp3Path, Buffer.from(arrayBuffer));

    // Convert MP3 → OGG/Opus for Telegram voice waveform display
    await execFileAsync("/opt/homebrew/bin/ffmpeg", [
      "-y", "-i", mp3Path,
      "-c:a", "libopus", "-b:a", "64k", "-vbr", "on",
      oggPath,
    ], { timeout: 60_000 });

    return { filePath: oggPath, format: "ogg" };
  } finally {
    // Clean up intermediate MP3
    if (fs.existsSync(mp3Path)) {
      fs.unlinkSync(mp3Path);
    }
  }
}
