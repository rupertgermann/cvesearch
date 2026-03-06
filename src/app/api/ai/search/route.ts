import { NextRequest, NextResponse } from "next/server";
import { generateSearchInterpretation } from "@/lib/ai-service";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";

  if (!prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const interpretation = await generateSearchInterpretation(prompt);
  return NextResponse.json(interpretation);
}, {
  route: "/api/ai/search",
  errorMessage: "Failed to interpret search prompt",
  rateLimit: API_RATE_LIMITS.aiWrite,
});
