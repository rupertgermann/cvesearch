"use client";

import { useEffect, useState } from "react";
import {
  createDefaultTriageRecord,
  loadTriageRecord,
  parseTags,
  TRIAGE_UPDATED_EVENT,
  TriageRecord,
  TriageStatus,
  writeTriageRecord,
} from "@/lib/triage";
import InlineLoadingSpinner from "./InlineLoadingSpinner";

export default function TriagePanel({ cveId }: { cveId: string }) {
  const [record, setRecord] = useState<TriageRecord>(() => createDefaultTriageRecord(cveId));
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sync = async () => {
      const next = await loadTriageRecord(cveId);
      setRecord(next);
      setTagInput(next.tags.join(", "));
    };

    void sync();
    window.addEventListener(TRIAGE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(TRIAGE_UPDATED_EVENT, sync);
  }, [cveId]);

  const persist = (next: TriageRecord) => {
    setSaving(true);
    void writeTriageRecord({
      ...next,
      updatedAt: new Date().toISOString(),
    }).then((saved) => { setRecord(saved); setSaving(false); }).catch(() => setSaving(false));
  };

  return (
    <div className="glass rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/40">Triage</h2>
        <p className="mt-1 text-sm text-white/25">Workspace-scoped analyst workflow for status, ownership, notes, and tags.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Status</span>
          <select
            value={record.status}
            onChange={(event) => persist({ ...record, status: event.target.value as TriageStatus })}
            className="input-base w-full px-3 py-2 text-sm"
          >
            <option value="new">New</option>
            <option value="investigating">Investigating</option>
            <option value="mitigated">Mitigated</option>
            <option value="accepted">Accepted Risk</option>
            <option value="closed">Closed</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Owner</span>
          <input
            type="text"
            value={record.owner}
            onChange={(event) => setRecord((current) => ({ ...current, owner: event.target.value }))}
            onBlur={() => persist(record)}
            placeholder="Security engineer"
            className="input-base w-full px-3 py-2 text-sm"
          />
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Tags</span>
          <input
            type="text"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onBlur={() => persist({ ...record, tags: parseTags(tagInput) })}
            placeholder="internet-facing, patch-window, openssl"
            className="input-base w-full px-3 py-2 text-sm"
          />
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Notes</span>
          <textarea
            value={record.notes}
            onChange={(event) => setRecord((current) => ({ ...current, notes: event.target.value }))}
            onBlur={() => persist(record)}
            rows={5}
            placeholder="Investigation notes, patch status, compensating controls..."
            className="input-base w-full px-3 py-2 text-sm"
          />
        </label>
      </div>

      {record.updatedAt && (
        <p className="mt-4 text-xs text-white/25">
          {saving ? (
            <span className="flex items-center gap-1.5"><InlineLoadingSpinner className="h-3 w-3" /> Saving changes...</span>
          ) : (
            <>Last updated {new Date(record.updatedAt).toLocaleString("en-US")}</>
          )}
        </p>
      )}

      {record.activity.length > 0 && (
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Recent activity</h3>
          <div className="mt-3 space-y-2">
            {record.activity.slice(0, 6).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <p className="text-sm text-white/50">{entry.summary}</p>
                <p className="mt-1 text-[11px] text-white/25">
                  {new Date(entry.createdAt).toLocaleString("en-US")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
