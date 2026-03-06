import { NextRequest, NextResponse } from "next/server";
import { getRecentAIRuns } from "@/lib/ai-service";

export async function GET(request: NextRequest) {
  try {
    const rawLimit = request.nextUrl.searchParams.get("limit");
    const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 25;
    const runs = await getRecentAIRuns(limit);
    return NextResponse.json(runs);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load AI runs" },
      { status: 500 }
    );
  }
}
