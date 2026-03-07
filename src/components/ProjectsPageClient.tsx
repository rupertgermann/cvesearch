"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createProjectAPI, deleteProjectAPI, listProjectsAPI, removeProjectItemAPI } from "@/lib/projects-api";
import { getCVEById } from "@/lib/api";
import { ProjectRecord, CVESummary } from "@/lib/types";
import CVEList from "./CVEList";
import AIProjectSummaryPanel from "./AIProjectSummaryPanel";

type ProjectDetails = Record<string, CVESummary[]>;

export default function ProjectsPageClient() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [details, setDetails] = useState<ProjectDetails>({});
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [busy, setBusy] = useState<"create" | "delete" | "remove-item" | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const projectList = await listProjectsAPI().catch((error: unknown) => {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to load projects.",
        });
        return [];
      });
      if (cancelled) return;

      setProjects(projectList);

      const nextDetails: ProjectDetails = {};
      for (const project of projectList) {
        const items = await Promise.all(
          project.items.slice(0, 10).map(async (item) => {
            try {
              return await getCVEById(item.cveId);
            } catch {
              return null;
            }
          })
        );
        nextDetails[project.id] = items.filter(Boolean) as CVESummary[];
      }

      if (!cancelled) {
        setDetails(nextDetails);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDeleteProject(projectId: string) {
    setBusy("delete");
    try {
      await deleteProjectAPI(projectId);
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setDetails((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setFeedback({ type: "success", message: "Project deleted." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to delete project." });
    } finally {
      setBusy(null);
    }
  }

  async function handleRemoveItem(projectId: string, cveId: string) {
    setBusy("remove-item");
    try {
      const updated = await removeProjectItemAPI(projectId, cveId);
      setProjects((current) => current.map((project) => (project.id === updated.id ? updated : project)));
      setDetails((current) => ({
        ...current,
        [projectId]: (current[projectId] ?? []).filter((item) => item.id !== cveId),
      }));
      setFeedback({ type: "success", message: `${cveId} removed from the project.` });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to remove CVE from project." });
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    setBusy("create");
    try {
      const project = await createProjectAPI({ name: newProjectName.trim() });
      setProjects((current) => [project, ...current]);
      setDetails((current) => ({ ...current, [project.id]: [] }));
      setNewProjectName("");
      setFeedback({ type: "success", message: `Created ${project.name}.` });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to create project." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app-shell px-4 py-8 sm:px-6">
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Projects</h1>
          <p className="mt-2 text-[15px] text-white/35">Server-persisted project groupings for CVEs in this workspace.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
            placeholder="New project name"
            className="input-base min-w-56 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void handleCreateProject()}
            disabled={busy !== null || !newProjectName.trim()}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy === "create" ? "Creating..." : "Create Project"}
          </button>
          <Link href="/" className="btn-ghost inline-flex px-4 py-2 text-sm">
            Back to Search
          </Link>
        </div>
      </div>

      {feedback && (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm animate-fade-in ${feedback.type === "error" ? "border-red-500/20 bg-red-500/8 text-red-300" : "border-emerald-500/20 bg-emerald-500/8 text-emerald-300"}`}>
          {feedback.message}
        </div>
      )}

      {projects.length === 0 && !loading ? (
        <div className="glass rounded-2xl px-6 py-10 text-center">
          <p className="text-lg font-medium text-white">No projects yet</p>
          <p className="mt-2 text-sm text-white/25">Create a project here or add a CVE to one from search results or the detail view.</p>
        </div>
      ) : loading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="glass rounded-2xl p-5">
              <div className="skeleton-shimmer h-7 w-48 rounded" />
              <div className="skeleton-shimmer mt-3 h-4 w-64 rounded" />
              <div className="mt-6 space-y-3">
                <div className="skeleton-shimmer h-20 rounded-xl" />
                <div className="skeleton-shimmer h-20 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {projects.map((project) => (
            <section key={project.id} className="glass rounded-2xl p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">{project.name}</h2>
                  {project.description && <p className="mt-1 text-sm text-white/40">{project.description}</p>}
                  <p className="mt-2 text-xs text-white/25">
                    {project.items.length} CVEs • Updated {new Date(project.updatedAt).toLocaleString("en-US")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteProject(project.id)}
                  disabled={busy !== null}
                  className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                >
                  Delete Project
                </button>
              </div>

              {project.items.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {project.items.slice(0, 12).map((item) => (
                    <button
                      key={item.cveId}
                      type="button"
                      onClick={() => void handleRemoveItem(project.id, item.cveId)}
                      disabled={busy !== null}
                      className="badge badge-xs border-white/[0.06] bg-white/[0.04] text-white/40 hover:bg-white/[0.08] disabled:opacity-50"
                    >
                      {item.cveId} ×
                    </button>
                  ))}
                </div>
              )}

              {project.activity.length > 0 && (
                <div className="mb-4 glass rounded-xl p-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Recent activity</h3>
                  <div className="mt-3 space-y-2">
                    {project.activity.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="flex items-start justify-between gap-3 text-sm">
                        <p className="text-white/50">{entry.summary}</p>
                        <span className="shrink-0 text-[11px] text-white/25">
                          {new Date(entry.createdAt).toLocaleString("en-US")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <AIProjectSummaryPanel projectId={project.id} />

              <CVEList
                cves={details[project.id] ?? []}
                loading={loading}
                skeletonCount={3}
                emptyTitle="No CVE previews loaded yet"
                emptyBody="Add more CVEs to this project or open them from search to populate the project workspace."
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
