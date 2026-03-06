import { NextRequest, NextResponse } from "next/server";
import { generateSearchInterpretation } from "@/lib/ai-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";

    if (!prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const interpretation = await generateSearchInterpretation(prompt);
    return NextResponse.json(interpretation);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to interpret search prompt" },
      { status: 500 }
    );
  }
}
