import { NextRequest, NextResponse } from "next/server";
import { generateDigest } from "@/lib/ai-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const digest = await generateDigest({
      watchlist: Array.isArray(body?.watchlist) ? body.watchlist : [],
      alerts: Array.isArray(body?.alerts) ? body.alerts : [],
      projects: Array.isArray(body?.projects) ? body.projects : [],
    });

    return NextResponse.json(digest);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate digest" },
      { status: 500 }
    );
  }
}
