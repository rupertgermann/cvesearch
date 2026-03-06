import { NextRequest, NextResponse } from "next/server";
import { getRecentAIRuns } from "@/lib/ai-service";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";

export const GET = withRouteProtection(async function GET(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 25;
  const runs = await getRecentAIRuns(limit);
  return NextResponse.json(runs);
}, {
  route: "/api/ai/runs",
  errorMessage: "Failed to load AI runs",
  rateLimit: API_RATE_LIMITS.aiRead,
});
