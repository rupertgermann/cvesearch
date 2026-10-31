"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createProjectAPI,
  deleteProjectAPI,
  listProjectsAPI,
  removeProjectItemAPI,
  updateProjectAPI,
  updateProjectItemAPI,
} from "@/lib/projects-api";
import { getCVEById } from "@/lib/api";
import { ProjectRecord, CVESummary, ProjectStatus, RemediationState, ProjectItem } from "@/lib/types";
import CVEList from "./CVEList";
import ConfirmationDialog from "./ConfirmationDialog";

type ProjectDetails = Record<string, CVESummary[]>;
type ProjectDrafts = Record<string, {
  name: string;
  description: string;
  owner: string;
  dueAt: string;
  labels: string;
  status: ProjectStatus;
}>;
type ProjectItemDrafts = Record<string, Record<string, {
  note: string;
  owner: string;
  remediationState: RemediationState;
  slaDueAt: string;
  exceptionReason: string;
  exceptionApprovedBy: string;
  exceptionExpiresAt: string;
  exceptionNotes: string;
}>>;

const PROJECT_STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "at_risk", label: "At Risk" },
  { value: "done", label: "Done" },
];

const REMEDIATION_STATE_OPTIONS: Array<{ value: RemediationState; label: string }> = [
  { value: "not_started", label: "Not started" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "validated", label: "Validated" },
  { value: "deferred", label: "Deferred" },
  { value: "exception", label: "Exception" },
];

export default function ProjectsPageClient() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [details, setDetails] = useState<ProjectDetails>({});
  const [drafts, setDrafts] = useState<ProjectDrafts>({});
  const [itemDrafts, setItemDrafts] = useState<ProjectItemDrafts>({});
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<
    | { kind: "delete-project"; projectId: string; name: string }
    | { kind: "remove-item"; projectId: string; cveId: string }
    | null
  >(null);

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
      setDrafts(buildProjectDrafts(projectList));
      setItemDrafts(buildItemDrafts(projectList));

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

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDeleteProject(projectId: string) {
    setBusy(`delete:${projectId}`);
    try {
      await deleteProjectAPI(projectId);
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setFeedback({ type: "success", message: "Project deleted." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to delete project." });
    } finally {
      setBusy(null);
    }
  }

  async function handleRemoveItem(projectId: string, cveId: string) {
    setBusy(`remove-item:${projectId}:${cveId}`);
    try {
      const updated = await removeProjectItemAPI(projectId, cveId);
      applyProjectUpdate(updated);
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
      setDrafts((current) => ({ ...current, [project.id]: buildProjectDraft(project) }));
      setItemDrafts((current) => ({ ...current, [project.id]: buildItemDraftMap(project.items) }));
      setDetails((current) => ({ ...current, [project.id]: [] }));
      setNewProjectName("");
      setFeedback({ type: "success", message: `Created ${project.name}.` });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to create project." });
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveProject(projectId: string) {
    const draft = drafts[projectId];
    if (!draft) return;

    setBusy(`project:${projectId}`);
    try {
      const updated = await updateProjectAPI(projectId, {
        name: draft.name,
        description: draft.description,
        owner: draft.owner,
        dueAt: draft.dueAt || null,
        labels: draft.labels.split(",").map((item) => item.trim()).filter(Boolean),
        status: draft.status,
      });
      applyProjectUpdate(updated);
      setFeedback({ type: "success", message: `${updated.name} updated.` });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to update project." });
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveItem(projectId: string, item: ProjectItem) {
    const draft = itemDrafts[projectId]?.[item.cveId];
    if (!draft) return;

    setBusy(`item:${projectId}:${item.cveId}`);
    try {
      const updated = await updateProjectItemAPI(projectId, item.cveId, {
        note: draft.note,
        owner: draft.owner,
        remediationState: draft.remediationState,
        slaDueAt: draft.slaDueAt || null,
        exception: draft.exceptionReason || draft.exceptionApprovedBy || draft.exceptionExpiresAt || draft.exceptionNotes
          ? {
              reason: draft.exceptionReason,
              approvedBy: draft.exceptionApprovedBy,
              expiresAt: draft.exceptionExpiresAt || null,
              notes: draft.exceptionNotes,
            }
          : null,
      });
      applyProjectUpdate(updated);
      setFeedback({ type: "success", message: `${item.cveId} workflow updated.` });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to update workflow item." });
    } finally {
      setBusy(null);
    }
  }

  function applyProjectUpdate(updated: ProjectRecord) {
    setProjects((current) => current.map((project) => (project.id === updated.id ? updated : project)));
    setDrafts((current) => ({ ...current, [updated.id]: buildProjectDraft(updated) }));
    setItemDrafts((current) => ({ ...current, [updated.id]: buildItemDraftMap(updated.items) }));
  }

  return (
    <div className="app-shell px-4 py-8 sm:px-6">
      <div className="page-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">Projects</h1>
          <span className="hidden text-sm text-white/25 sm:inline">Remediation workspaces with owners, SLAs, and timelines</span>
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
          {projects.map((project) => {
            const draft = drafts[project.id] ?? buildProjectDraft(project);
            const metrics = deriveProjectMetrics(project);

            return (
              <section key={project.id} className="glass rounded-2xl p-5">
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-white">{project.name}</h2>
                      <span className={`badge badge-xs ${statusClasses(project.status ?? "active")}`}>{statusLabel(project.status ?? "active")}</span>
                      {(project.labels ?? []).map((label) => (
                        <span key={label} className="badge badge-xs border-cyan-500/20 bg-cyan-500/8 text-cyan-200">
                          {label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-white/25">
                      {project.items.length} CVEs • {metrics.inProgress} in progress • {metrics.overdue} overdue SLA • Updated {new Date(project.updatedAt).toLocaleString("en-US")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingConfirmation({ kind: "delete-project", projectId: project.id, name: project.name })}
                    disabled={busy !== null}
                    className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
                  >
                    Delete Project
                  </button>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="glass rounded-xl p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Project management</h3>
                      <button
                        type="button"
                        onClick={() => void handleSaveProject(project.id)}
                        disabled={busy !== null}
                        className="rounded-lg border border-cyan-500/25 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                      >
                        Save project
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Name">
                        <input
                          value={draft.name}
                          onChange={(event) => updateProjectDraft(setDrafts, project.id, "name", event.target.value)}
                          className="input-base w-full px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="Owner">
                        <input
                          value={draft.owner}
                          onChange={(event) => updateProjectDraft(setDrafts, project.id, "owner", event.target.value)}
                          placeholder="Security owner"
                          className="input-base w-full px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="Due date">
                        <input
                          type="date"
                          value={toDateInput(draft.dueAt)}
                          onChange={(event) => updateProjectDraft(setDrafts, project.id, "dueAt", event.target.value)}
                          className="input-base w-full px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="Status">
                        <select
                          value={draft.status}
                          onChange={(event) => updateProjectDraft(setDrafts, project.id, "status", event.target.value as ProjectStatus)}
                          className="input-base w-full px-3 py-2 text-sm"
                        >
                          {PROJECT_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Labels" className="md:col-span-2">
                        <input
                          value={draft.labels}
                          onChange={(event) => updateProjectDraft(setDrafts, project.id, "labels", event.target.value)}
                          placeholder="internet-facing, patch-window, customer-impact"
                          className="input-base w-full px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="Description" className="md:col-span-2">
                        <textarea
                          value={draft.description}
                          onChange={(event) => updateProjectDraft(setDrafts, project.id, "description", event.target.value)}
                          rows={3}
                          className="input-base w-full px-3 py-2 text-sm"
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="glass rounded-xl p-4">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Timeline view</h3>
                    <div className="mt-3 space-y-2">
                      {(project.timeline ?? []).slice(0, 8).map((entry) => (
                        <div key={entry.id} className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className={`badge badge-xs ${timelineClasses(entry.kind)}`}>{timelineLabel(entry.kind)}</span>
                            <span className="text-[11px] text-white/25">{new Date(entry.createdAt).toLocaleString("en-US")}</span>
                          </div>
                          <p className="mt-2 text-sm text-white/55">{entry.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {project.items.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Vulnerability workflow</h3>
                      <div className="flex flex-wrap gap-2 text-[11px] text-white/30">
                        <span>{metrics.validated} validated</span>
                        <span>{metrics.exceptions} exceptions</span>
                        <span>{metrics.overdue} SLA overdue</span>
                      </div>
                    </div>
                    {project.items.map((item) => {
                      const draftItem = itemDrafts[project.id]?.[item.cveId] ?? buildItemDraft(item);
                      return (
                        <div key={item.cveId} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm text-white">{item.cveId}</span>
                                <span className={`badge badge-xs ${remediationClasses(item.remediationState ?? "not_started")}`}>
                                  {remediationLabel(item.remediationState ?? "not_started")}
                                </span>
                                {item.exception?.reason && (
                                  <span className="badge badge-xs border-orange-500/25 bg-orange-500/10 text-orange-200">Exception</span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-white/25">
                                Added {new Date(item.addedAt).toLocaleDateString("en-US")}
                                {item.slaDueAt ? ` • SLA ${new Date(item.slaDueAt).toLocaleDateString("en-US")}` : ""}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleSaveItem(project.id, item)}
                                disabled={busy !== null}
                                className="rounded-lg border border-cyan-500/25 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                              >
                                Save workflow
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingConfirmation({ kind: "remove-item", projectId: project.id, cveId: item.cveId })}
                                disabled={busy !== null}
                                className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <Field label="Owner">
                              <input
                                value={draftItem.owner}
                                onChange={(event) => updateItemDraft(setItemDrafts, project.id, item.cveId, "owner", event.target.value)}
                                className="input-base w-full px-3 py-2 text-sm"
                              />
                            </Field>
                            <Field label="Remediation state">
                              <select
                                value={draftItem.remediationState}
                                onChange={(event) => updateItemDraft(setItemDrafts, project.id, item.cveId, "remediationState", event.target.value as RemediationState)}
                                className="input-base w-full px-3 py-2 text-sm"
                              >
                                {REMEDIATION_STATE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </Field>
                            <Field label="SLA due">
                              <input
                                type="date"
                                value={toDateInput(draftItem.slaDueAt)}
                                onChange={(event) => updateItemDraft(setItemDrafts, project.id, item.cveId, "slaDueAt", event.target.value)}
                                className="input-base w-full px-3 py-2 text-sm"
                              />
                            </Field>
                            <Field label="Exception expires">
                              <input
                                type="date"
                                value={toDateInput(draftItem.exceptionExpiresAt)}
                                onChange={(event) => updateItemDraft(setItemDrafts, project.id, item.cveId, "exceptionExpiresAt", event.target.value)}
                                className="input-base w-full px-3 py-2 text-sm"
                              />
                            </Field>
                            <Field label="Note" className="md:col-span-2 xl:col-span-2">
                              <textarea
                                rows={2}
                                value={draftItem.note}
                                onChange={(event) => updateItemDraft(setItemDrafts, project.id, item.cveId, "note", event.target.value)}
                                className="input-base w-full px-3 py-2 text-sm"
                              />
                            </Field>
                            <Field label="Exception reason" className="md:col-span-2 xl:col-span-1">
                              <input
                                value={draftItem.exceptionReason}
                                onChange={(event) => updateItemDraft(setItemDrafts, project.id, item.cveId, "exceptionReason", event.target.value)}
                                className="input-base w-full px-3 py-2 text-sm"
                              />
                            </Field>
                            <Field label="Approved by" className="md:col-span-2 xl:col-span-1">
                              <input
                                value={draftItem.exceptionApprovedBy}
                                onChange={(event) => updateItemDraft(setItemDrafts, project.id, item.cveId, "exceptionApprovedBy", event.target.value)}
                                className="input-base w-full px-3 py-2 text-sm"
                              />
                            </Field>
                            <Field label="Exception notes" className="md:col-span-2 xl:col-span-4">
                              <textarea
                                rows={2}
                                value={draftItem.exceptionNotes}
                                onChange={(event) => updateItemDraft(setItemDrafts, project.id, item.cveId, "exceptionNotes", event.target.value)}
                                className="input-base w-full px-3 py-2 text-sm"
                              />
                            </Field>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-5">
                  <div className="glass rounded-xl p-4">
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
                </div>

                <div className="mt-5">
                  <CVEList
                    cves={details[project.id] ?? []}
                    loading={loading}
                    skeletonCount={3}
                    emptyTitle="No CVE previews loaded yet"
                    emptyBody="Add more CVEs to this project or open them from search to populate the project workspace."
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        open={pendingConfirmation !== null}
        title={
          pendingConfirmation?.kind === "delete-project"
            ? "Delete project?"
            : "Remove CVE from project?"
        }
        message={
          pendingConfirmation?.kind === "delete-project"
            ? `${pendingConfirmation.name} and its workflow history will be removed from this workspace.`
            : pendingConfirmation
              ? `${pendingConfirmation.cveId} will be removed from this project's workflow tracking.`
              : ""
        }
        confirmLabel={
          pendingConfirmation?.kind === "delete-project"
            ? "Delete Project"
            : "Remove CVE"
        }
        busy={busy !== null}
        onConfirm={() => {
          if (!pendingConfirmation) {
            return;
          }

          if (pendingConfirmation.kind === "delete-project") {
            void handleDeleteProject(pendingConfirmation.projectId);
          } else {
            void handleRemoveItem(pendingConfirmation.projectId, pendingConfirmation.cveId);
          }

          setPendingConfirmation(null);
        }}
        onClose={() => setPendingConfirmation(null)}
      />
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/25">{label}</span>
      {children}
    </label>
  );
}

function buildProjectDrafts(projects: ProjectRecord[]): ProjectDrafts {
  return Object.fromEntries(projects.map((project) => [project.id, buildProjectDraft(project)]));
}

function buildProjectDraft(project: ProjectRecord) {
  return {
    name: project.name,
    description: project.description,
    owner: project.owner ?? "",
    dueAt: toDateInput(project.dueAt ?? ""),
    labels: (project.labels ?? []).join(", "),
    status: project.status ?? "active",
  };
}

function buildItemDrafts(projects: ProjectRecord[]): ProjectItemDrafts {
  return Object.fromEntries(projects.map((project) => [project.id, buildItemDraftMap(project.items)]));
}

function buildItemDraftMap(items: ProjectRecord["items"]) {
  return Object.fromEntries(items.map((item) => [item.cveId, buildItemDraft(item)]));
}

function buildItemDraft(item: ProjectItem) {
  return {
    note: item.note ?? "",
    owner: item.owner ?? "",
    remediationState: item.remediationState ?? "not_started",
    slaDueAt: toDateInput(item.slaDueAt ?? ""),
    exceptionReason: item.exception?.reason ?? "",
    exceptionApprovedBy: item.exception?.approvedBy ?? "",
    exceptionExpiresAt: toDateInput(item.exception?.expiresAt ?? ""),
    exceptionNotes: item.exception?.notes ?? "",
  };
}

function updateProjectDraft(
  setDrafts: Dispatch<SetStateAction<ProjectDrafts>>,
  projectId: string,
  key: keyof ProjectDrafts[string],
  value: string
) {
  setDrafts((current) => ({
    ...current,
    [projectId]: {
      ...current[projectId],
      [key]: value,
    },
  }));
}

function updateItemDraft(
  setDrafts: Dispatch<SetStateAction<ProjectItemDrafts>>,
  projectId: string,
  cveId: string,
  key: keyof ProjectItemDrafts[string][string],
  value: string
) {
  setDrafts((current) => ({
    ...current,
    [projectId]: {
      ...(current[projectId] ?? {}),
      [cveId]: {
        ...(current[projectId]?.[cveId] ?? buildItemDraft({ cveId, addedAt: new Date().toISOString() })),
        [key]: value,
      },
    },
  }));
}

function deriveProjectMetrics(project: ProjectRecord) {
  const now = Date.now();
  return {
    inProgress: project.items.filter((item) => item.remediationState === "in_progress").length,
    validated: project.items.filter((item) => item.remediationState === "validated").length,
    exceptions: project.items.filter((item) => Boolean(item.exception?.reason)).length,
    overdue: project.items.filter((item) => item.slaDueAt && Date.parse(item.slaDueAt) < now).length,
  };
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function statusLabel(value: ProjectStatus): string {
  switch (value) {
    case "planned":
      return "Planned";
    case "at_risk":
      return "At Risk";
    case "done":
      return "Done";
    default:
      return "Active";
  }
}

function statusClasses(value: ProjectStatus): string {
  switch (value) {
    case "planned":
      return "border-blue-500/25 bg-blue-500/10 text-blue-200";
    case "at_risk":
      return "border-red-500/25 bg-red-500/10 text-red-200";
    case "done":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
    default:
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-200";
  }
}

function remediationLabel(value: RemediationState): string {
  switch (value) {
    case "planned":
      return "Planned";
    case "in_progress":
      return "In Progress";
    case "validated":
      return "Validated";
    case "deferred":
      return "Deferred";
    case "exception":
      return "Exception";
    default:
      return "Not Started";
  }
}

function remediationClasses(value: RemediationState): string {
  switch (value) {
    case "planned":
      return "border-blue-500/25 bg-blue-500/10 text-blue-200";
    case "in_progress":
      return "border-amber-500/25 bg-amber-500/10 text-amber-200";
    case "validated":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
    case "deferred":
      return "border-white/[0.12] bg-white/[0.06] text-white/55";
    case "exception":
      return "border-orange-500/25 bg-orange-500/10 text-orange-200";
    default:
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-200";
  }
}

function timelineClasses(kind: "project" | "vulnerability" | "sla"): string {
  switch (kind) {
    case "sla":
      return "border-red-500/25 bg-red-500/10 text-red-200";
    case "vulnerability":
      return "border-amber-500/25 bg-amber-500/10 text-amber-200";
    default:
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-200";
  }
}

function timelineLabel(kind: "project" | "vulnerability" | "sla"): string {
  switch (kind) {
    case "sla":
      return "SLA";
    case "vulnerability":
      return "Vulnerability";
    default:
      return "Project";
  }
}
