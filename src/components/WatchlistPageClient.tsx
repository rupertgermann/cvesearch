"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCVEById } from "@/lib/api";
import { CVEDetail, CVESummary } from "@/lib/types";
import { loadWatchlist, removeWatchlistItems, WATCHLIST_UPDATED_EVENT } from "@/lib/watchlist";
import { addProjectItemAPI, createProjectAPI, listProjectsAPI } from "@/lib/projects-api";
import {
  loadTriageMap,
  loadTriageRecord,
  readTriageMap,
  TRIAGE_UPDATED_EVENT,
  TriageStatus,
  writeTriageRecord,
} from "@/lib/triage";
import { ProjectRecord } from "@/lib/types";
import CVEList from "@/components/CVEList";
import AIDigestPanel from "@/components/AIDigestPanel";
import AIWatchlistReviewPanel from "@/components/AIWatchlistReviewPanel";

export default function WatchlistPageClient() {
  const [items, setItems] = useState<CVESummary[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | TriageStatus>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<TriageStatus>("investigating");
  const [bulkProjectId, setBulkProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<null | "remove" | "triage" | "project">(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [ids, _triageMap, nextProjects] = await Promise.all([
        loadWatchlist(),
        loadTriageMap(),
        listProjectsAPI().catch(() => []),
      ]);

      void _triageMap;

      if (ids.length === 0) {
        setItems([]);
        setProjects(nextProjects);
        setLoading(false);
        return;
      }

      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            return await getCVEById(id);
          } catch {
            return null;
          }
        })
      );

      setItems(results.filter((item): item is CVEDetail => Boolean(item)));
      setProjects(nextProjects);
      setLoading(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to load watchlist workspace data");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(WATCHLIST_UPDATED_EVENT, load);
    window.addEventListener(TRIAGE_UPDATED_EVENT, load);

    return () => {
      window.removeEventListener(WATCHLIST_UPDATED_EVENT, load);
      window.removeEventListener(TRIAGE_UPDATED_EVENT, load);
    };
  }, [load]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return items;

    const triage = readTriageMap();
    return items.filter((item) => (triage[item.id]?.status ?? "new") === statusFilter);
  }, [items, statusFilter]);

  const triageCount = useMemo(() => {
    const triage = readTriageMap();
    const counts: Record<TriageStatus, number> = {
      new: 0,
      investigating: 0,
      mitigated: 0,
      accepted: 0,
      closed: 0,
    };

    for (const item of items) {
      const status = triage[item.id]?.status ?? "new";
      counts[status] += 1;
    }

    return counts;
  }, [items]);

  const visibleIds = filteredItems.map((item) => item.id);
  const selectedVisibleCount = selectedIds.filter((id) => visibleIds.includes(id)).length;

  const setFeedback = (kind: "success" | "error", message: string) => {
    if (kind === "success") {
      setActionSuccess(message);
      setActionError(null);
      return;
    }

    setActionError(message);
    setActionSuccess(null);
  };

  const handleBulkRemove = async () => {
    if (selectedIds.length === 0) return;
    setActionBusy("remove");

    try {
      await removeWatchlistItems(selectedIds);
      setSelectedIds([]);
      setFeedback("success", `Removed ${selectedIds.length} ${selectedIds.length === 1 ? "item" : "items"} from the watchlist.`);
      await load();
    } catch (error) {
      setFeedback("error", error instanceof Error ? error.message : "Failed to remove selected watchlist items");
    } finally {
      setActionBusy(null);
    }
  };

  const handleBulkTriage = async () => {
    if (selectedIds.length === 0) return;
    setActionBusy("triage");

    try {
      await Promise.all(
        selectedIds.map(async (cveId) => {
          const current = await loadTriageRecord(cveId);
          await writeTriageRecord({
            ...current,
            status: bulkStatus,
            updatedAt: new Date().toISOString(),
          });
        })
      );
      setFeedback("success", `Updated triage status to ${bulkStatus} for ${selectedIds.length} ${selectedIds.length === 1 ? "item" : "items"}.`);
    } catch (error) {
      setFeedback("error", error instanceof Error ? error.message : "Failed to update triage status");
    } finally {
      setActionBusy(null);
    }
  };

  const handleBulkProjectAssignment = async () => {
    if (selectedIds.length === 0) return;
    if (!bulkProjectId) {
      setFeedback("error", "Choose an existing project or create a new one first.");
      return;
    }

    setActionBusy("project");

    try {
      let projectId = bulkProjectId;
      let projectName = projects.find((project) => project.id === bulkProjectId)?.name || "project";

      if (bulkProjectId === "__new__") {
        if (!newProjectName.trim()) {
          setFeedback("error", "Enter a new project name before assigning selected CVEs.");
          setActionBusy(null);
          return;
        }

        const project = await createProjectAPI({ name: newProjectName.trim() });
        projectId = project.id;
        projectName = project.name;
        setNewProjectName("");
      }

      await Promise.all(selectedIds.map((cveId) => addProjectItemAPI(projectId, { cveId })));
      setProjects(await listProjectsAPI());
      setFeedback("success", `Added ${selectedIds.length} ${selectedIds.length === 1 ? "item" : "items"} to ${projectName}.`);
    } catch (error) {
      setFeedback("error", error instanceof Error ? error.message : "Failed to assign selected CVEs to a project");
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="app-shell px-4 py-8 sm:px-6">
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Watchlist</h1>
          <p className="mt-2 text-[15px] text-white/35">Bookmarked CVEs and advisories with workspace triage status, notes, and ownership.</p>
        </div>
        <Link href="/" className="btn-ghost inline-flex px-4 py-2 text-sm">
          Back to Search
        </Link>
      </div>

      {(actionSuccess || actionError) && (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm animate-fade-in ${actionError ? "border-red-500/20 bg-red-500/8 text-red-300" : "border-emerald-500/20 bg-emerald-500/8 text-emerald-300"}`}>
          {actionError || actionSuccess}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Summary label="Total" value={items.length} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <Summary label="New" value={triageCount.new} active={statusFilter === "new"} onClick={() => setStatusFilter("new")} />
        <Summary
          label="Investigating"
          value={triageCount.investigating}
          active={statusFilter === "investigating"}
          onClick={() => setStatusFilter("investigating")}
        />
        <Summary
          label="Mitigated"
          value={triageCount.mitigated}
          active={statusFilter === "mitigated"}
          onClick={() => setStatusFilter("mitigated")}
        />
        <Summary
          label="Accepted"
          value={triageCount.accepted}
          active={statusFilter === "accepted"}
          onClick={() => setStatusFilter("accepted")}
        />
        <Summary
          label="Closed"
          value={triageCount.closed}
          active={statusFilter === "closed"}
          onClick={() => setStatusFilter("closed")}
        />
      </div>

      {items.length > 0 && (
        <div className="glass mb-6 rounded-xl p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/40">Bulk Actions</h2>
              <p className="mt-1 text-sm text-white/25">
                {selectedIds.length > 0
                  ? `${selectedIds.length} selected across the current watchlist.`
                  : "Select CVEs to remove them from the watchlist, update triage, or assign them to a project."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(Array.from(new Set([...selectedIds, ...visibleIds])))}
                className="btn-ghost px-3 py-2 text-sm"
              >
                Select Visible ({visibleIds.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                disabled={selectedIds.length === 0}
                className="btn-ghost px-3 py-2 text-sm disabled:opacity-50"
              >
                Clear Selection
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_1fr_1.4fr]">
            <div className="glass rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Watchlist</p>
              <p className="mt-2 text-sm text-white/35">Remove selected CVEs from the current workspace watchlist.</p>
              <button
                type="button"
                onClick={() => void handleBulkRemove()}
                disabled={selectedIds.length === 0 || actionBusy !== null}
                className="mt-3 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
              >
                {actionBusy === "remove" ? "Removing..." : `Remove Selected${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`}
              </button>
            </div>

            <div className="glass rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Triage</p>
              <p className="mt-2 text-sm text-white/35">Set a shared triage status for the selected CVEs.</p>
              <div className="mt-3 flex gap-2">
                <select
                  value={bulkStatus}
                  onChange={(event) => setBulkStatus(event.target.value as TriageStatus)}
                  className="input-base min-w-0 flex-1 px-3 py-2 text-sm"
                >
                  <option value="new">New</option>
                  <option value="investigating">Investigating</option>
                  <option value="mitigated">Mitigated</option>
                  <option value="accepted">Accepted Risk</option>
                  <option value="closed">Closed</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleBulkTriage()}
                  disabled={selectedIds.length === 0 || actionBusy !== null}
                  className="btn-primary px-3 py-2 text-sm disabled:opacity-50"
                >
                  {actionBusy === "triage" ? "Applying..." : "Apply"}
                </button>
              </div>
            </div>

            <div className="glass rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Project Assignment</p>
              <p className="mt-2 text-sm text-white/35">Add the selected CVEs to an existing project or create a new one inline.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <select
                  value={bulkProjectId}
                  onChange={(event) => setBulkProjectId(event.target.value)}
                  className="input-base px-3 py-2 text-sm"
                >
                  <option value="">Choose project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                  <option value="__new__">Create new project...</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleBulkProjectAssignment()}
                  disabled={selectedIds.length === 0 || actionBusy !== null}
                  className="rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-3 py-2 text-sm font-semibold text-black shadow-[0_2px_12px_-2px_rgba(52,211,153,0.3)] transition-all hover:shadow-[0_4px_20px_-2px_rgba(52,211,153,0.4)] disabled:opacity-50"
                >
                  {actionBusy === "project" ? "Adding..." : "Add to Project"}
                </button>
              </div>
              {bulkProjectId === "__new__" && (
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="New project name"
                  className="input-base mt-2 w-full px-3 py-2 text-sm"
                />
              )}
            </div>
          </div>

          {selectedVisibleCount > 0 && (
            <p className="mt-3 text-xs text-white/25">
              {selectedVisibleCount} of {visibleIds.length} visible items selected for the current filter.
            </p>
          )}
        </div>
      )}

      <div className="mb-6">
        <AIWatchlistReviewPanel watchlistCount={items.length} />
      </div>

      <div className="mb-6">
        <AIDigestPanel />
      </div>

      <CVEList
        cves={filteredItems}
        loading={loading}
        selectable={items.length > 0}
        selectedIds={selectedIds}
        onToggleSelect={(cveId) => {
          setSelectedIds((current) =>
            current.includes(cveId) ? current.filter((id) => id !== cveId) : [...current, cveId]
          );
        }}
        emptyTitle={items.length === 0 ? "Your watchlist is empty" : "No watchlist items match this filter"}
        emptyBody={items.length === 0 ? "Bookmark CVEs from search results or the detail page to start tracking them here." : "Try another triage status or update triage on the selected vulnerabilities."}
        skeletonCount={6}
      />
    </div>
  );
}

function Summary({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-4 text-left transition-all duration-200 ${
        active
          ? "border-cyan-500/25 bg-cyan-500/8 shadow-[0_0_16px_-4px_rgba(34,211,238,0.15)]"
          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1]"
      }`}
    >
      <div className="font-mono text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-white/35">{label}</div>
    </button>
  );
}
