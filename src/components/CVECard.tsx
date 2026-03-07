"use client";

import Link from "next/link";
import { CVESummary } from "@/lib/types";
import {
  getSeverityFromScore,
  formatDate,
  extractDescription,
  extractPublishedDate,
  extractCVEId,
  extractSourceId,
  truncate,
} from "@/lib/utils";
import { getExploitReferenceCount } from "@/lib/search";
import SeverityBadge from "./SeverityBadge";
import BookmarkButton from "./BookmarkButton";
import CopyLinkButton from "./CopyLinkButton";
import TriageBadge from "./TriageBadge";
import ProjectPickerButton from "./ProjectPickerButton";
import { loadTriageRecord, TRIAGE_UPDATED_EVENT } from "@/lib/triage";
import { useEffect, useState } from "react";

interface CVECardProps {
  cve: CVESummary;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (cveId: string) => void;
}

export default function CVECard({ cve, selectable = false, selected = false, onToggleSelect }: CVECardProps) {
  const [triageStatus, setTriageStatus] = useState<"new" | "investigating" | "mitigated" | "accepted" | "closed">("new");
  const cveId = extractCVEId(cve);
  const description = extractDescription(cve);
  const published = extractPublishedDate(cve);
  const sourceId = extractSourceId(cve);
  const score = cve.cvss3 ?? cve.cvss;
  const severity = getSeverityFromScore(score);
  const href = `/cve/${encodeURIComponent(cveId)}`;
  const affectedProducts = (cve.vulnerable_product ?? []).slice(0, 3);
  const exploitReferenceCount = getExploitReferenceCount(cve);

  useEffect(() => {
    const sync = async () => setTriageStatus((await loadTriageRecord(cveId)).status);
    void sync();
    window.addEventListener(TRIAGE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(TRIAGE_UPDATED_EVENT, sync);
  }, [cveId]);

  return (
    <div className={`glass card-hover rounded-xl p-5 ${
      selected ? "glow-border-cyan" : ""
    }`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {selectable && (
          <label className="mt-0.5 flex shrink-0 cursor-pointer items-center gap-2 text-sm text-white/40">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(cveId)}
              className="h-4 w-4 rounded border-white/20 bg-white/[0.04] text-cyan-500 focus:ring-cyan-500/40 focus:ring-offset-0"
            />
            <span className="sm:hidden">Select</span>
          </label>
        )}
        <Link href={href} className="group min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-[15px] font-semibold text-white transition-colors group-hover:text-cyan-400">
              {cveId}
            </h3>
            {sourceId && (
              <span className="badge badge-xs border-white/[0.08] bg-white/[0.04] text-white/40">
                {sourceId}
              </span>
            )}
            {score !== undefined && score !== null && (
              <SeverityBadge severity={severity} score={score} size="sm" />
            )}
            {cve.kev && (
              <span className="badge badge-xs border-red-500/30 bg-red-500/10 text-red-300">
                <span className="h-1 w-1 rounded-full bg-red-400 animate-pulse" />
                KEV
              </span>
            )}
            {cve.kev?.knownRansomwareCampaignUse === "Known" && (
              <span className="badge badge-xs border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300">
                Ransomware
              </span>
            )}
            {typeof cve.epss === "number" && cve.epss >= 0.2 && (
              <span className="badge badge-xs border-amber-500/30 bg-amber-500/10 text-amber-200">
                EPSS {(cve.epss * 100).toFixed(0)}%
              </span>
            )}
            {exploitReferenceCount > 0 && (
              <span className="badge badge-xs border-orange-500/30 bg-orange-500/10 text-orange-200">
                {exploitReferenceCount} exploit ref{exploitReferenceCount === 1 ? "" : "s"}
              </span>
            )}
            {cve.state && cve.state !== "PUBLISHED" && (
              <span className="badge badge-xs border-white/[0.08] bg-white/[0.04] text-white/40">
                {cve.state}
              </span>
            )}
            <TriageBadge status={triageStatus} />
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-white/45">
            {truncate(description, 250)}
          </p>
        </Link>
        <div className="flex items-center gap-1.5 self-start">
          <ProjectPickerButton cveId={cveId} />
          <CopyLinkButton href={href} size="sm" />
          <BookmarkButton cveId={cveId} size="sm" />
        </div>
      </div>

      {affectedProducts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {affectedProducts.map((item) => (
            <span key={item} className="badge badge-xs border-cyan-500/15 bg-cyan-500/8 text-cyan-300/80">
              {item}
            </span>
          ))}
          {(cve.vulnerable_product?.length ?? 0) > affectedProducts.length && (
            <span className="badge badge-xs border-white/[0.06] bg-white/[0.03] text-white/30">
              +{(cve.vulnerable_product?.length ?? 0) - affectedProducts.length} more
            </span>
          )}
        </div>
      )}

      <Link href={href} className="mt-3 block">
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/30">
          {published && (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              {formatDate(published)}
            </span>
          )}
          {cve.assigner && (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              {cve.assigner}
            </span>
          )}
          {cve.cwe && (
            <span className="badge badge-xs border-purple-500/20 bg-purple-500/8 text-purple-400">
              {cve.cwe}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
