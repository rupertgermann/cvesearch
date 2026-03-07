import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { createPromptTemplateForUser, listPromptTemplatesForUser } from "@/lib/workspace-store";

export const GET = withRouteProtection(async function GET(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const response = NextResponse.json(await listPromptTemplatesForUser(session.userId));
  return applyWorkspaceSession(response, session);
}, {
  route: "/api/prompt-templates",
  errorMessage: "Failed to load prompt templates",
  rateLimit: API_RATE_LIMITS.workspaceReads,
});

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (!name || !prompt) {
    return applyWorkspaceSession(NextResponse.json({ error: "name and prompt are required" }, { status: 400 }), session);
  }

  const response = NextResponse.json(await createPromptTemplateForUser(session.userId, name, prompt), { status: 201 });
  return applyWorkspaceSession(response, session);
}, {
  route: "/api/prompt-templates",
  errorMessage: "Failed to create prompt template",
  rateLimit: API_RATE_LIMITS.workspaceMutations,
});
