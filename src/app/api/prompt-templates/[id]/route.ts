import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { deletePromptTemplateForUser } from "@/lib/workspace-store";

export const DELETE = withRouteProtection(async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = getOrCreateWorkspaceSession(request);
  const { id } = await context.params;
  const deleted = await deletePromptTemplateForUser(session.userId, decodeURIComponent(id));
  const response = deleted
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "Prompt template not found" }, { status: 404 });
  return applyWorkspaceSession(response, session);
}, {
  route: "/api/prompt-templates/[id]",
  errorMessage: "Failed to delete prompt template",
  rateLimit: API_RATE_LIMITS.workspaceMutations,
});
