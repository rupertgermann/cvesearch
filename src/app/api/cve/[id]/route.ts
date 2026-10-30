import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, PublicRouteError, withRouteProtection } from "@/lib/api-route-guard";
import { getCVEByIdServer } from "@/lib/server-api";
import { VulnerabilityAPIError } from "@/lib/vulnerability-api";

export const GET = withRouteProtection(async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  const cve = await getCVEByIdServer(decodedId).catch((error: unknown) => {
    if (error instanceof VulnerabilityAPIError && error.status === 404) {
      throw new PublicRouteError(error.message, "CVE not found", 404);
    }
    throw error;
  });
  return NextResponse.json(cve);
}, {
  route: "/api/cve/[id]",
  errorMessage: "Failed to load CVE detail",
  rateLimit: API_RATE_LIMITS.proxy,
});
