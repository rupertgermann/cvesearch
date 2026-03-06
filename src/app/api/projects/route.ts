import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects, normalizeProjectName } from "@/lib/projects-store";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";

export const GET = withRouteProtection(async function GET(_request: NextRequest) {
  void _request;
  const projects = await listProjects();
  return NextResponse.json(projects);
}, {
  route: "/api/projects",
  errorMessage: "Failed to load projects",
  rateLimit: API_RATE_LIMITS.projectReads,
});

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? normalizeProjectName(body.name) : "";
  const description = typeof body?.description === "string" ? body.description : "";

  if (!name) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }

  const project = await createProject({ name, description });
  return NextResponse.json(project, { status: 201 });
}, {
  route: "/api/projects",
  errorMessage: "Failed to create project",
  rateLimit: API_RATE_LIMITS.projectMutations,
});
