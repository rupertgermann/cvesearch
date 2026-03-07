import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { deleteInventoryAssetForUser, updateInventoryAssetForUser } from "@/lib/workspace-store";
import { InventoryAssetRecord } from "@/lib/workspace-types";

export const PATCH = withRouteProtection(async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = getOrCreateWorkspaceSession(request);
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const asset = await updateInventoryAssetForUser(session.userId, id, normalizeInventoryAssetPatch(body));

  if (!asset) {
    return applyWorkspaceSession(NextResponse.json({ error: "Inventory asset not found" }, { status: 404 }), session);
  }

  return applyWorkspaceSession(NextResponse.json(asset), session);
}, {
  route: "/api/inventory/[id]",
  errorMessage: "Failed to update inventory asset",
  rateLimit: API_RATE_LIMITS.workspaceMutations,
});

export const DELETE = withRouteProtection(async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = getOrCreateWorkspaceSession(request);
  const { id } = await context.params;
  const deleted = await deleteInventoryAssetForUser(session.userId, id);
  if (!deleted) {
    return applyWorkspaceSession(NextResponse.json({ error: "Inventory asset not found" }, { status: 404 }), session);
  }

  return applyWorkspaceSession(NextResponse.json({ success: true }), session);
}, {
  route: "/api/inventory/[id]",
  errorMessage: "Failed to delete inventory asset",
  rateLimit: API_RATE_LIMITS.workspaceMutations,
});

function normalizeInventoryAssetPatch(value: unknown): Partial<Omit<InventoryAssetRecord, "id" | "createdAt" | "updatedAt">> {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    ...(typeof record.vendor === "string" ? { vendor: record.vendor } : {}),
    ...(typeof record.product === "string" ? { product: record.product } : {}),
    ...(typeof record.version === "string" ? { version: record.version } : {}),
    ...(typeof record.environment === "string" ? { environment: record.environment } : {}),
    ...(record.criticality === "critical" || record.criticality === "high" || record.criticality === "medium" || record.criticality === "low" ? { criticality: record.criticality } : {}),
    ...(typeof record.notes === "string" ? { notes: record.notes } : {}),
  };
}
