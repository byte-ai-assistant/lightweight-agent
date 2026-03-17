import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/agent/index.js";

export async function POST(req: NextRequest) {
  const { message, userId = "web:anonymous" } = await req.json();

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const response = await runAgent(userId, message);
    return NextResponse.json({ response });
  } catch (err: any) {
    console.error("Chat API error:", err?.message);
    return NextResponse.json({ error: "Agent error", detail: err?.message }, { status: 500 });
  }
}
