import { NextRequest, NextResponse } from "next/server";
import { generateRemediationPlan } from "@/lib/ai-service";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { getCVEByIdServer, getEPSSServer } from "@/lib/server-api";
import { CVEDetail } from "@/lib/types";
import { readTriageRecordForUser } from "@/lib/workspace-store";
import { getAICacheEntry, setAICacheEntry } from "@/lib/ai-cache-store";

export const POST = withRouteProtection(async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = getOrCreateWorkspaceSession(request);
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const regenerate = body?.regenerate === true;
  const decodedId = decodeURIComponent(id);

  if (!regenerate) {
    const cached = getAICacheEntry(session.userId, "remediation_agent", decodedId);
    if (cached) {
      const data = JSON.parse(cached.outputJson);
      return applyWorkspaceSession(NextResponse.json({ ...data, _cachedAt: cached.createdAt }), session);
    }
  }

  const requestDetail = isCVEDetail(body?.detail) ? body.detail : null;
  const detail = await getCVEByIdServer(decodedId).catch(() => requestDetail);

  if (!detail) {
    return applyWorkspaceSession(NextResponse.json({ error: "Failed to load CVE detail for AI remediation" }, { status: 502 }), session);
  }

  const epss = await getEPSSServer(detail.id).catch(() => null);
  const triage = body?.triage && typeof body.triage === "object"
    ? body.triage
    : await readTriageRecordForUser(session.userId, detail.id);
  const remediation = await generateRemediationPlan({
    detail,
    epss,
    triage,
  }, { userId: session.userId });

  setAICacheEntry(session.userId, "remediation_agent", decodedId, JSON.stringify(remediation));
  return applyWorkspaceSession(NextResponse.json(remediation), session);
}, {
  route: "/api/ai/remediation/[id]",
  errorMessage: "Failed to generate AI remediation plan",
  rateLimit: API_RATE_LIMITS.aiWrite,
});

function isCVEDetail(value: unknown): value is CVEDetail {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).id === "string";
}
