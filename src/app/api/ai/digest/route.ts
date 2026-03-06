import { NextRequest, NextResponse } from "next/server";
import { generateDigest } from "@/lib/ai-service";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const digest = await generateDigest({
    watchlist: Array.isArray(body?.watchlist) ? body.watchlist : [],
    alerts: Array.isArray(body?.alerts) ? body.alerts : [],
    projects: Array.isArray(body?.projects) ? body.projects : [],
  });

  return NextResponse.json(digest);
}, {
  route: "/api/ai/digest",
  errorMessage: "Failed to generate digest",
  rateLimit: API_RATE_LIMITS.aiWrite,
});
