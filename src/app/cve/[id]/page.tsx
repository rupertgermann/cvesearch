"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { CVEDetail, EPSSData } from "@/lib/types";
import { getCVEById, getEPSS } from "@/lib/api";
import { isCveIdQuery } from "@/lib/search";
import {
  extractDescription,
  extractCVSSScore,
  extractCVEId,
  formatDate,
} from "@/lib/utils";
import SeverityBadge from "@/components/SeverityBadge";

export default function CVEDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [cve, setCve] = useState<CVEDetail | null>(null);
  const [epss, setEpss] = useState<EPSSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const decodedId = decodeURIComponent(id);
        const cveData = await getCVEById(decodedId);
        const epssTarget = getEPSSLookupId(cveData);
        const epssData = epssTarget ? await getEPSS(epssTarget) : null;
        setCve(cveData);
        setEpss(epssData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load CVE");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded-lg bg-white/[0.06]" />
          <div className="h-6 w-64 rounded-lg bg-white/[0.06]" />
          <div className="h-32 rounded-xl bg-white/[0.04]" />
          <div className="h-64 rounded-xl bg-white/[0.04]" />
        </div>
      </div>
    );
  }

  if (error || !cve) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to search
        </Link>
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-6 py-8 text-center">
          <p className="text-lg font-medium text-red-400">{error || "CVE not found"}</p>
        </div>
      </div>
    );
  }

  const cveId = extractCVEId(cve);
  const description = extractDescription(cve);
  const cvssInfo = extractCVSSScore(cve);
  const published = cve.cveMetadata?.datePublished || cve.published;
  const modified = cve.cveMetadata?.dateUpdated || cve.modified;
  const assigner = cve.cveMetadata?.assignerShortName || cve.assigner;
  const state = cve.cveMetadata?.state || cve.state;
  const references = normalizeReferences(cve);
  const affected = cve.containers?.cna?.affected || [];
  const problemTypes = cve.containers?.cna?.problemTypes || [];
  const metrics = cve.containers?.cna?.metrics || [];

  // Extract CVSS details from metrics
  const cvssDetail = metrics.length > 0
    ? (metrics[0].cvssV3_1 || metrics[0].cvssV3_0 || null)
    : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Back nav */}
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to search
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-white sm:text-3xl">{cveId}</h1>
          {cvssInfo && (
            <SeverityBadge
              severity={cvssInfo.severity}
              score={cvssInfo.score}
              version={cvssInfo.version}
              size="lg"
            />
          )}
          {state && (
            <span className={`rounded-md px-2.5 py-1 text-xs font-medium border ${
              state === "PUBLISHED" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-gray-500/10 text-gray-400 border-gray-500/20"
            }`}>
              {state}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
          {published && (
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              Published: {formatDate(published)}
            </span>
          )}
          {modified && (
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Modified: {formatDate(modified)}
            </span>
          )}
          {assigner && (
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              Assigner: {assigner}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Description */}
        <Section title="Description">
          <p className="text-sm leading-relaxed text-gray-300 whitespace-pre-wrap">{description}</p>
        </Section>

        {/* CVSS Details */}
        {cvssDetail && (
          <Section title="CVSS Score Breakdown">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Attack Vector" value={cvssDetail.attackVector} />
              <MetricCard label="Attack Complexity" value={cvssDetail.attackComplexity} />
              <MetricCard label="Privileges Required" value={cvssDetail.privilegesRequired} />
              <MetricCard label="User Interaction" value={cvssDetail.userInteraction} />
              <MetricCard label="Scope" value={cvssDetail.scope} />
              <MetricCard label="Confidentiality" value={cvssDetail.confidentialityImpact} />
              <MetricCard label="Integrity" value={cvssDetail.integrityImpact} />
              <MetricCard label="Availability" value={cvssDetail.availabilityImpact} />
            </div>
            {cvssDetail.vectorString && (
              <div className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-gray-500">Vector: </span>
                <code className="text-xs text-cyan-400">{cvssDetail.vectorString}</code>
              </div>
            )}
          </Section>
        )}

        {/* EPSS */}
        {epss && (
          <Section title="EPSS (Exploit Prediction)">
            <div className="flex flex-wrap gap-6">
              <div>
                <div className="text-2xl font-bold text-white">
                  {(epss.epss * 100).toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500">Probability of exploitation</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {(epss.percentile * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">Percentile rank</div>
              </div>
              <div className="flex-1">
                <div className="mb-1 text-xs text-gray-500">Exploitation likelihood</div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-red-500 transition-all"
                    style={{ width: `${Math.min(epss.epss * 100 * 2, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* Affected Products */}
        {affected.length > 0 && (
          <Section title="Affected Products">
            <div className="space-y-3">
              {affected.map((a, i) => (
                <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.vendor && (
                      <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/20">
                        {a.vendor}
                      </span>
                    )}
                    {a.product && (
                      <span className="text-sm font-medium text-white">{a.product}</span>
                    )}
                    {a.defaultStatus && (
                      <span className="text-xs text-gray-500">({a.defaultStatus})</span>
                    )}
                  </div>
                  {a.versions && a.versions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {a.versions.slice(0, 20).map((v, j) => (
                        <span
                          key={j}
                          className={`rounded-md px-2 py-0.5 text-xs border ${
                            v.status === "affected"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : "bg-green-500/10 text-green-400 border-green-500/20"
                          }`}
                        >
                          {v.version}
                          {v.lessThan && ` - < ${v.lessThan}`}
                          <span className="ml-1 opacity-60">({v.status})</span>
                        </span>
                      ))}
                      {a.versions.length > 20 && (
                        <span className="text-xs text-gray-500">+{a.versions.length - 20} more</span>
                      )}
                    </div>
                  )}
                  {a.platforms && a.platforms.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      Platforms: {a.platforms.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Problem Types / CWE */}
        {(problemTypes.length > 0 || cve.cwe) && (
          <Section title="Weakness / CWE">
            {problemTypes.map((pt, i) =>
              pt.descriptions.map((d, j) => (
                <div key={`${i}-${j}`} className="flex flex-wrap items-center gap-2">
                  {d.cweId && (
                    <span className="rounded-md bg-purple-500/10 px-2.5 py-1 text-sm font-medium text-purple-400 border border-purple-500/20">
                      {d.cweId}
                    </span>
                  )}
                  <span className="text-sm text-gray-300">{d.description}</span>
                </div>
              ))
            )}
            {!problemTypes.length && cve.cwe && (
              <span className="rounded-md bg-purple-500/10 px-2.5 py-1 text-sm font-medium text-purple-400 border border-purple-500/20">
                {cve.cwe}
              </span>
            )}
          </Section>
        )}

        {/* References */}
        {references.length > 0 && (
          <Section title="References">
            <div className="space-y-2">
              {references.map((ref, i) => {
                const url = ref.url;
                const tags = ref.tags ?? [];
                return (
                  <div key={i} className="flex items-start gap-2 group">
                    <svg className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.868-4.242a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-sm text-cyan-400 hover:text-cyan-300 hover:underline"
                      >
                        {url}
                      </a>
                      {tags.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {tags.map((tag, k) => (
                            <span key={k} className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-gray-500">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Raw JSON */}
        <Section title="Raw Data" collapsible>
          <pre className="max-h-96 overflow-auto rounded-lg bg-black/40 p-4 text-xs text-gray-400 font-mono leading-relaxed">
            {JSON.stringify(cve, null, 2)}
          </pre>
        </Section>
      </div>
    </div>
  );
}

function getEPSSLookupId(cve: CVEDetail): string | null {
  const directId = extractCVEId(cve);
  if (isCveIdQuery(directId)) {
    return directId.toUpperCase();
  }

  const alias = cve.aliases?.find((item) => isCveIdQuery(item));
  return alias ? alias.toUpperCase() : null;
}

function normalizeReferences(cve: CVEDetail): Array<{ url: string; tags?: string[] }> {
  const rawReferences = cve.containers?.cna?.references;

  if (rawReferences?.length) {
    const normalized: Array<{ url: string; tags?: string[] }> = [];

    for (const reference of rawReferences) {
      const candidate = extractReferenceUrl(reference.url);
      if (!candidate) continue;

      normalized.push({
        url: candidate,
        tags: reference.tags,
      });
    }

    return normalized;
  }

  const normalized: Array<{ url: string }> = [];

  for (const reference of cve.references ?? []) {
    const candidate = extractReferenceUrl(reference);
    if (!candidate) continue;

    normalized.push({ url: candidate });
  }

  return normalized;
}

function extractReferenceUrl(reference: unknown): string | null {
  if (typeof reference === "string") {
    return reference;
  }

  if (
    reference &&
    typeof reference === "object" &&
    "url" in reference &&
    typeof reference.url === "string"
  ) {
    return reference.url;
  }

  return null;
}

function Section({
  title,
  children,
  collapsible = false,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(!collapsible);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        onClick={() => collapsible && setIsOpen(!isOpen)}
        className={`flex w-full items-center justify-between px-5 py-4 text-left ${
          collapsible ? "cursor-pointer hover:bg-white/[0.02]" : "cursor-default"
        } rounded-t-xl`}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          {title}
        </h2>
        {collapsible && (
          <svg
            className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>
      {isOpen && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value?: string }) {
  if (!value) return null;

  const getColor = (v: string) => {
    const upper = v.toUpperCase();
    if (["NETWORK", "HIGH", "CHANGED"].includes(upper)) return "text-red-400";
    if (["ADJACENT_NETWORK", "ADJACENT", "REQUIRED"].includes(upper)) return "text-orange-400";
    if (["LOCAL", "LOW"].includes(upper)) return "text-yellow-400";
    if (["PHYSICAL", "NONE", "UNCHANGED"].includes(upper)) return "text-green-400";
    return "text-gray-300";
  };

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-sm font-medium ${getColor(value)}`}>{value}</div>
    </div>
  );
}
