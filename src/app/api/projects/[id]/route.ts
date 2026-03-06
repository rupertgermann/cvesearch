import { NextRequest, NextResponse } from "next/server";
import { deleteProject } from "@/lib/projects-store";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";

export const DELETE = withRouteProtection(async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const success = await deleteProject(id);

  if (!success) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}, {
  route: "/api/projects/[id]",
  errorMessage: "Failed to delete project",
  rateLimit: API_RATE_LIMITS.projectMutations,
});
