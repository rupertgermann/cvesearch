"use client";

import { useEffect, useState } from "react";
import {
  addProjectItemAPI,
  createProjectAPI,
  listProjectsAPI,
} from "@/lib/projects-api";
import { ProjectRecord } from "@/lib/types";

export default function ProjectPickerButton({ cveId }: { cveId: string }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    listProjectsAPI()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [open]);

  async function handleCreateProject() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const project = await createProjectAPI({ name });
      setProjects((current) => [project, ...current]);
      setName("");
      setMessage(`Created ${project.name}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(projectId: string) {
    setBusy(true);
    try {
      const project = await addProjectItemAPI(projectId, { cveId });
      setProjects((current) => current.map((entry) => (entry.id === project.id ? project : entry)));
      setMessage("Added to project");
      setTimeout(() => setOpen(false), 300);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex h-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 text-[11px] font-medium text-white/25 transition-all hover:border-white/[0.12] hover:text-white/50"
      >
        Projects
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-20 w-72 glass-raised rounded-xl p-4 shadow-2xl shadow-black/50 animate-fade-in-scale">
          <div className="mb-3">
            <div className="text-sm font-semibold text-white">Add {cveId} to project</div>
            <p className="mt-1 text-[11px] text-white/20">Projects are persisted server-side.</p>
          </div>

          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New project name"
              className="input-base min-w-0 flex-1 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={handleCreateProject}
              disabled={busy}
              className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Create
            </button>
          </div>

          <div className="max-h-56 space-y-1.5 overflow-auto">
            {projects.length === 0 ? (
              <div className="glass rounded-lg px-3 py-4 text-center text-sm text-white/25">
                No projects yet.
              </div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handleAdd(project.id)}
                  disabled={busy}
                  className="block w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition-all hover:bg-white/[0.05] hover:border-white/[0.1] disabled:opacity-50"
                >
                  <div className="text-sm font-medium text-white">{project.name}</div>
                  <div className="mt-0.5 text-[11px] text-white/20">{project.items.length} CVEs</div>
                </button>
              ))
            )}
          </div>

          {message && <div className="mt-3 text-xs text-cyan-400/80">{message}</div>}
        </div>
      )}
    </div>
  );
}
