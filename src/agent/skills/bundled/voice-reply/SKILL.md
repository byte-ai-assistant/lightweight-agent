---
name: voice-reply
description: Reply with voice audio using ElevenLabs text-to-speech
user-invocable: true
metadata:
  openclaw:
    emoji: "\U0001F50A"
    requires:
      primaryEnv: ELEVEN_LABS_API_KEY
---

# Voice Reply

Reply to the user with a voice message using ElevenLabs text-to-speech.

## When to Use

- The user sent a voice message (respond in kind)
- The user says "out loud", "speak", "say it", "read this to me", or requests audio
- The user explicitly asks for a voice reply

## How to Use

1. Call the `generate_speech` tool with the text you want to speak
2. Include the returned `[[VOICE:/path/to/file.ogg]]` marker in your response
3. Any text outside the marker is sent as a follow-up text message

## Guidelines

- Keep voice text concise and natural — write as you would speak
- Do not include markdown formatting, code blocks, or special characters in the voice text
- Send a text version alongside the voice for reference and accessibility
- For long responses, voice only the summary or key points

## Example

User sends a voice message asking "What's the weather like?"

1. Generate your answer text: "It's currently 72 degrees and sunny in San Francisco."
2. Call `generate_speech` with that text
3. Respond with: `[[VOICE:/tmp/<project-name>-tts/123.ogg]] It's currently 72 degrees and sunny in San Francisco.`

The Telegram bot will send the voice message first, then the text as a follow-up.
