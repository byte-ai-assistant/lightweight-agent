import OpenAI from "openai";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

const WHISPER_TMP = path.join(os.tmpdir(), "lightweight-agent-whisper");
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? "whisper-1";

function ensureTmpDir() {
  if (!fs.existsSync(WHISPER_TMP)) {
    fs.mkdirSync(WHISPER_TMP, { recursive: true });
  }
}

/**
 * Convert any audio file to 16kHz mono WAV via ffmpeg.
 * Returns the path to the converted file.
 */
export async function convertToWav(inputPath: string): Promise<string> {
  ensureTmpDir();
  const outName = `${Date.now()}-${path.basename(inputPath, path.extname(inputPath))}.wav`;
  const outPath = path.join(WHISPER_TMP, outName);

  await execFileAsync("/opt/homebrew/bin/ffmpeg", [
    "-y", "-i", inputPath,
    "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
    outPath,
  ], { timeout: 60_000 });

  return outPath;
}

/**
 * Transcribe an audio file using OpenAI Whisper API.
 * Converts to WAV first (ffmpeg), sends to API, cleans up temp file.
 */
export async function transcribeAudio(inputPath: string): Promise<{ text: string }> {
  let wavPath: string | null = null;

  try {
    // Convert to WAV for best compatibility
    wavPath = await convertToWav(inputPath);

    const openai = new OpenAI();
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(wavPath),
      model: WHISPER_MODEL,
    });

    return { text: transcription.text };
  } finally {
    // Clean up temp WAV
    if (wavPath && fs.existsSync(wavPath)) {
      fs.unlinkSync(wavPath);
    }
  }
}
