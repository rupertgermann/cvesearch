import { NextRequest, NextResponse } from "next/server";
import { addProjectItem, removeProjectItem } from "@/lib/projects-store";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";

export const POST = withRouteProtection(async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const cveId = typeof body?.cveId === "string" ? body.cveId.trim() : "";
  const note = typeof body?.note === "string" ? body.note : "";

  if (!cveId) {
    return NextResponse.json({ error: "cveId is required" }, { status: 400 });
  }

  const project = await addProjectItem(id, { cveId, note });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}, {
  route: "/api/projects/[id]/items",
  errorMessage: "Failed to add project item",
  rateLimit: API_RATE_LIMITS.projectMutations,
});

export const DELETE = withRouteProtection(async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const cveId = typeof body?.cveId === "string" ? body.cveId.trim() : "";

  if (!cveId) {
    return NextResponse.json({ error: "cveId is required" }, { status: 400 });
  }

  const project = await removeProjectItem(id, cveId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}, {
  route: "/api/projects/[id]/items",
  errorMessage: "Failed to remove project item",
  rateLimit: API_RATE_LIMITS.projectMutations,
});
