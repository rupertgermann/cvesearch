"use client";

import { CVESummary } from "@/lib/types";
import CVECard from "./CVECard";

interface CVEListProps {
  cves: CVESummary[];
  loading?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  skeletonCount?: number;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (cveId: string) => void;
}

function Skeleton({ index }: { index: number }) {
  return (
    <div
      className="glass rounded-xl p-5"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center gap-2.5">
        <div className="skeleton-shimmer h-5 w-36 rounded-md" />
        <div className="skeleton-shimmer h-5 w-16 rounded-md" />
      </div>
      <div className="mt-3.5 space-y-2">
        <div className="skeleton-shimmer h-3.5 w-full rounded" />
        <div className="skeleton-shimmer h-3.5 w-4/5 rounded" />
      </div>
      <div className="mt-3.5 flex gap-3">
        <div className="skeleton-shimmer h-3.5 w-24 rounded" />
        <div className="skeleton-shimmer h-3.5 w-20 rounded" />
      </div>
    </div>
  );
}

export default function CVEList({
  cves,
  loading,
  emptyTitle = "No vulnerabilities found",
  emptyBody = "Try adjusting your search or filters",
  skeletonCount = 8,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
}: CVEListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Skeleton key={i} index={i} />
        ))}
      </div>
    );
  }

  if (cves.length === 0) {
    return (
      <div className="glass flex flex-col items-center justify-center rounded-xl py-20 animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
          <svg className="h-8 w-8 text-white/15" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <p className="mt-5 text-[15px] font-medium text-white/60">{emptyTitle}</p>
        <p className="mt-1.5 text-sm text-white/25">{emptyBody}</p>
      </div>
    );
  }

  return (
    <div className="stagger-children space-y-3">
      {cves.map((cve, i) => (
        <CVECard
          key={cve.id || i}
          cve={cve}
          selectable={selectable}
          selected={selectedIds.includes(cve.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
