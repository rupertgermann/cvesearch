import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import {
  fetchVulnerabilityAPIUpstream,
  isAllowedVulnerabilityAPIPath,
  VulnerabilityAPIError,
} from "@/lib/vulnerability-api";

export const GET = withRouteProtection(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  if (!isAllowedVulnerabilityAPIPath(path)) {
    return NextResponse.json({ error: "Unsupported upstream path" }, { status: 400 });
  }

  try {
    const data = await fetchVulnerabilityAPIUpstream<unknown>(path);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof VulnerabilityAPIError && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    throw err;
  }
}, {
  route: "/api/proxy",
  errorMessage: "Proxy error",
  rateLimit: API_RATE_LIMITS.proxy,
});
