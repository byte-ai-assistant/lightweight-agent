// This runs before any other module via --import flag
// Prevents Claude Code "nested session" detection
delete process.env.CLAUDECODE;

// Remove placeholder API key so Claude Code uses its own auth
if (process.env.ANTHROPIC_API_KEY?.startsWith("your-")) {
  delete process.env.ANTHROPIC_API_KEY;
}
