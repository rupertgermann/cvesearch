import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { createInventoryAssetForUser, listInventoryAssetsForUser } from "@/lib/workspace-store";
import { InventoryAssetRecord } from "@/lib/workspace-types";

export const GET = withRouteProtection(async function GET(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const response = NextResponse.json(await listInventoryAssetsForUser(session.userId));
  return applyWorkspaceSession(response, session);
}, {
  route: "/api/inventory",
  errorMessage: "Failed to load inventory assets",
  rateLimit: API_RATE_LIMITS.workspaceReads,
});

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const body = await request.json().catch(() => null);
  const asset = await createInventoryAssetForUser(session.userId, normalizeInventoryAssetInput(body));
  return applyWorkspaceSession(NextResponse.json(asset, { status: 201 }), session);
}, {
  route: "/api/inventory",
  errorMessage: "Failed to create inventory asset",
  rateLimit: API_RATE_LIMITS.workspaceMutations,
});

function normalizeInventoryAssetInput(value: unknown): Omit<InventoryAssetRecord, "id" | "createdAt" | "updatedAt"> {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    name: typeof record.name === "string" ? record.name : "",
    vendor: typeof record.vendor === "string" ? record.vendor : "",
    product: typeof record.product === "string" ? record.product : "",
    version: typeof record.version === "string" ? record.version : "",
    environment: typeof record.environment === "string" ? record.environment : "",
    criticality: record.criticality === "critical" || record.criticality === "high" || record.criticality === "medium" || record.criticality === "low" ? record.criticality : "medium",
    notes: typeof record.notes === "string" ? record.notes : "",
  };
}
