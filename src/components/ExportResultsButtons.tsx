"use client";

import { CVESummary } from "@/lib/types";
import { SearchState } from "@/lib/search";
import { extractDescription, extractPublishedDate, getSeverityFromScore } from "@/lib/utils";

interface ExportResultsButtonsProps {
  cves: CVESummary[];
  search: SearchState;
}

export default function ExportResultsButtons({ cves, search }: ExportResultsButtonsProps) {
  if (cves.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => downloadFile(buildCsv(cves), `${buildFileName(search)}.csv`, "text/csv;charset=utf-8")}
        className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.06] hover:text-white"
      >
        Export CSV
      </button>
      <button
        type="button"
        onClick={() => downloadFile(JSON.stringify(cves, null, 2), `${buildFileName(search)}.json`, "application/json")}
        className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.06] hover:text-white"
      >
        Export JSON
      </button>
    </div>
  );
}

function buildCsv(cves: CVESummary[]): string {
  const rows = [
    ["id", "published", "severity", "cvss", "assigner", "cwe", "description"],
    ...cves.map((cve) => {
      const score = cve.cvss3 ?? cve.cvss;
      return [
        cve.id,
        extractPublishedDate(cve) ?? "",
        getSeverityFromScore(score),
        score?.toString() ?? "",
        cve.assigner ?? "",
        cve.cwe ?? "",
        extractDescription(cve),
      ];
    }),
  ];

  return rows
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
}

function escapeCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildFileName(search: SearchState): string {
  const slug = search.query || search.product || search.vendor || "cve-results";
  return slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cve-results";
}

function downloadFile(contents: string, fileName: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
