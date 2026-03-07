import { NextRequest, NextResponse } from "next/server";
import { generateWatchlistReview, getRecentAIRuns } from "@/lib/ai-service";
import { API_RATE_LIMITS, withRouteProtection } from "@/lib/api-route-guard";
import { applyWorkspaceSession, getOrCreateWorkspaceSession } from "@/lib/auth-session";
import { listProjects } from "@/lib/projects-store";
import { getCVEByIdServer } from "@/lib/server-api";
import { readTriageMapForUser, listWatchlistEntriesForUser } from "@/lib/workspace-store";
import { CVEDetail } from "@/lib/types";
import { extractDescription, extractCVEId, getSeverityFromScore } from "@/lib/utils";

export const POST = withRouteProtection(async function POST(request: NextRequest) {
  const session = getOrCreateWorkspaceSession(request);
  const [watchlistEntries, triageMap, projects, recentRuns] = await Promise.all([
    listWatchlistEntriesForUser(session.userId),
    readTriageMapForUser(session.userId),
    listProjects().catch(() => []),
    getRecentAIRuns(100).catch(() => []),
  ]);

  const details = await Promise.all(
    watchlistEntries.map(async (entry) => {
      try {
        const detail = await getCVEByIdServer(entry.cveId);
        return { entry, detail };
      } catch {
        return null;
      }
    })
  );

  const previousReviewAt = recentRuns.find((run) => run.feature === "watchlist_analyst")?.createdAt ?? null;
  const items = details.flatMap((result) => {
    if (!result) {
      return [];
    }

    const cveId = extractCVEId(result.detail);
    const triage = triageMap[cveId];
    const relatedProjects = projects.filter((project) => project.items.some((item) => item.cveId === cveId));
    return [{
      id: cveId,
      summary: extractDescription(result.detail),
      severity: getSeverityFromScore(result.detail.cvss3 ?? result.detail.cvss),
      kev: Boolean(result.detail.kev),
      addedAt: result.entry.addedAt,
      triageStatus: triage?.status ?? "new",
      triageUpdatedAt: triage?.updatedAt ?? result.entry.addedAt,
      projectNames: relatedProjects.map((project) => project.name),
      projectUpdatedAt: relatedProjects[0]?.updatedAt ?? null,
      aliases: result.detail.aliases ?? [],
      relatedIds: extractRelatedIds(result.detail),
      affectedProducts: extractAffectedProducts(result.detail),
      published: result.detail.cveMetadata?.datePublished || result.detail.published || result.entry.addedAt,
      modified: result.detail.cveMetadata?.dateUpdated || result.detail.modified || result.entry.addedAt,
    }];
  });

  const review = await generateWatchlistReview({
    items,
    previousReviewAt,
  });

  return applyWorkspaceSession(NextResponse.json(review), session);
}, {
  route: "/api/ai/watchlist/review",
  errorMessage: "Failed to generate AI watchlist review",
  rateLimit: API_RATE_LIMITS.aiWrite,
});

function extractRelatedIds(detail: CVEDetail): string[] {
  const related = new Set<string>();
  const record = detail as unknown as Record<string, unknown>;

  for (const alias of detail.aliases ?? []) {
    related.add(alias);
  }

  for (const key of ["linked_vulnerabilities", "related_vulnerabilities", "vulnerabilities", "related"]) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === "string") {
        related.add(item);
        continue;
      }

      if (item && typeof item === "object") {
        const objectValue = item as Record<string, unknown>;
        for (const field of ["id", "cve", "vulnerability"]) {
          if (typeof objectValue[field] === "string") {
            related.add(objectValue[field] as string);
          }
        }
      }
    }
  }

  related.delete(extractCVEId(detail));
  return Array.from(related).slice(0, 8);
}

function extractAffectedProducts(detail: CVEDetail): string[] {
  const items = detail.containers?.cna?.affected?.flatMap((entry) => [entry.product, entry.vendor].filter((value): value is string => Boolean(value))) ?? [];
  return Array.from(new Set(items)).slice(0, 6);
}
