import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { importProjects } from "@/lib/projects-store";
import { createDefaultTriageRecord, normalizeTriageRecord, TriageRecord } from "@/lib/triage-shared";
import { ProjectRecord } from "@/lib/types";
import { importWorkspaceStateForUser } from "@/lib/workspace-store";
import { AlertRule, InventoryAssetRecord, SavedView, WorkspaceImportMode } from "@/lib/workspace-types";

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const body = await request.json().catch(() => null);
  const mode: WorkspaceImportMode = body?.mode === "replace" ? "replace" : "merge";
  const snapshot = body?.snapshot;

  if (!snapshot || typeof snapshot !== "object") {
    return applyWorkspaceSession(NextResponse.json({ error: "snapshot is required" }, { status: 400 }), session);
  }

  const watchlist = Array.isArray(snapshot.watchlist)
    ? snapshot.watchlist.filter((value: unknown): value is string => typeof value === "string")
    : [];
  const savedViews = Array.isArray(snapshot.savedViews)
    ? snapshot.savedViews.flatMap((value: unknown) => (isSavedView(value) ? [value] : []))
    : [];
  const alertRules = Array.isArray(snapshot.alertRules)
    ? snapshot.alertRules.flatMap((value: unknown) => (isAlertRule(value) ? [value] : []))
    : [];
  const inventoryAssets = Array.isArray(snapshot.inventoryAssets)
    ? snapshot.inventoryAssets.flatMap((value: unknown) => (isInventoryAsset(value) ? [value] : []))
    : [];
  const triageRecords = Array.isArray(snapshot.triageRecords)
    ? snapshot.triageRecords.flatMap((value: unknown) => (isTriageRecord(value) ? [normalizeTriageRecord(value)] : []))
    : [];
  const projects = Array.isArray(snapshot.projects)
    ? snapshot.projects.flatMap((value: unknown) => (isProjectRecord(value) ? [value] : []))
    : [];

  await importWorkspaceStateForUser(
    session.userId,
    {
      watchlist,
      savedViews,
      alertRules,
      inventoryAssets,
      triageRecords,
    },
    mode
  );
  await importProjects(projects, mode);

  const response = NextResponse.json({
    success: true,
    mode,
    imported: {
      watchlist: watchlist.length,
      savedViews: savedViews.length,
      alertRules: alertRules.length,
      inventoryAssets: inventoryAssets.length,
      triageRecords: triageRecords.length,
      projects: projects.length,
    },
  });

  return applyWorkspaceSession(response, session);
}, {
  route: "/api/workspace/import",
  errorMessage: "Failed to import workspace data",
  rateLimit: API_RATE_LIMITS.workspaceMutations,
});

function isSavedView(value: unknown): value is SavedView {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).id === "string"
    && typeof (value as Record<string, unknown>).name === "string"
    && typeof (value as Record<string, unknown>).search === "object";
}

function isAlertRule(value: unknown): value is AlertRule {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).id === "string"
    && typeof (value as Record<string, unknown>).name === "string"
    && typeof (value as Record<string, unknown>).search === "object";
}

function isInventoryAsset(value: unknown): value is InventoryAssetRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && typeof record.name === "string"
    && typeof record.vendor === "string"
    && typeof record.product === "string"
    && typeof record.version === "string"
    && typeof record.environment === "string"
    && typeof record.criticality === "string"
    && typeof record.notes === "string"
    && typeof record.createdAt === "string"
    && typeof record.updatedAt === "string";
}

function isTriageRecord(value: unknown): value is TriageRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const fallback = createDefaultTriageRecord(typeof record.cveId === "string" ? record.cveId : "");

  return typeof record.cveId === "string"
    && typeof record.status === "string"
    && typeof record.owner === "string"
    && typeof record.notes === "string"
    && Array.isArray(record.tags)
    && typeof (record.updatedAt ?? fallback.updatedAt) === "string"
    && Array.isArray(record.activity ?? fallback.activity);
}

function isProjectRecord(value: unknown): value is ProjectRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && typeof record.name === "string"
    && typeof record.description === "string"
    && typeof record.createdAt === "string"
    && typeof record.updatedAt === "string"
    && Array.isArray(record.items)
    && Array.isArray(record.activity);
}
