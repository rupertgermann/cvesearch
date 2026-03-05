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
import SeverityBadge from "./SeverityBadge";
import BookmarkButton from "./BookmarkButton";
import CopyLinkButton from "./CopyLinkButton";
import TriageBadge from "./TriageBadge";
import ProjectPickerButton from "./ProjectPickerButton";
import { readTriageRecord, TRIAGE_UPDATED_EVENT } from "@/lib/triage";
import { useEffect, useState } from "react";

interface CVECardProps {
  cve: CVESummary;
}

export default function CVECard({ cve }: CVECardProps) {
  const [triageStatus, setTriageStatus] = useState<ReturnType<typeof readTriageRecord>["status"]>("new");
  const cveId = extractCVEId(cve);
  const description = extractDescription(cve);
  const published = extractPublishedDate(cve);
  const sourceId = extractSourceId(cve);
  const score = cve.cvss3 ?? cve.cvss;
  const severity = getSeverityFromScore(score);
  const href = `/cve/${encodeURIComponent(cveId)}`;
  const affectedProducts = (cve.vulnerable_product ?? []).slice(0, 3);

  useEffect(() => {
    const sync = () => setTriageStatus(readTriageRecord(cveId).status);
    sync();
    window.addEventListener(TRIAGE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(TRIAGE_UPDATED_EVENT, sync);
  }, [cveId]);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-white/[0.12] hover:bg-white/[0.04]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Link href={href} className="group min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-base font-semibold text-white group-hover:text-cyan-400 transition-colors">
              {cveId}
            </h3>
            {sourceId && (
              <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-gray-400">
                Source: {sourceId}
              </span>
            )}
            {score !== undefined && score !== null && (
              <SeverityBadge severity={severity} score={score} size="sm" />
            )}
            {cve.state && cve.state !== "PUBLISHED" && (
              <span className="rounded-md bg-gray-500/15 px-2 py-0.5 text-xs text-gray-400 border border-gray-500/30">
                {cve.state}
              </span>
            )}
            <TriageBadge status={triageStatus} />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            {truncate(description, 250)}
          </p>
        </Link>
        <div className="flex items-center gap-2 self-start">
          <ProjectPickerButton cveId={cveId} />
          <CopyLinkButton href={href} size="sm" />
          <BookmarkButton cveId={cveId} size="sm" />
        </div>
      </div>

      {affectedProducts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {affectedProducts.map((item) => (
            <span key={item} className="rounded-md border border-cyan-500/15 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300">
              {item}
            </span>
          ))}
          {(cve.vulnerable_product?.length ?? 0) > affectedProducts.length && (
            <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-gray-400">
              +{(cve.vulnerable_product?.length ?? 0) - affectedProducts.length} more
            </span>
          )}
        </div>
      )}

      <Link href={href} className="mt-3 block">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
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
          <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-purple-400 border border-purple-500/20">
            {cve.cwe}
          </span>
        )}
        </div>
      </Link>
    </div>
  );
}
