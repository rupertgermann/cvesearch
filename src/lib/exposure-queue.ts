import {
  buildRepoExposureRows,
  compareExposurePriority,
  ExposureQueue,
  ExposureRow,
  exposureRowKey,
  getExposurePriority,
  isFindingTriageHidden,
  matchesInventoryAsset,
} from "./exposure";
import { readFindingTriageMap } from "./finding-triage-store";
import { listMonitoredRepos } from "./monitored-repos-store";
import { listRepoScansForRepo } from "./repo-scans-store";
import { enrichCVEs } from "./server-api";
import { fetchLatestCVEsUntil } from "./workspace-context";
import {
  listInventoryAssetMatchesForUser,
  listInventoryAssetsForUser,
  readFeedBackfill,
  readInventoryMatchCursors,
  recordInventoryAssetMatches,
  writeFeedBackfill,
} from "./workspace-store";
import { InventoryAssetRecord } from "./workspace-types";

// Scans looked at when working out a repo finding's first-seen date.
const REPO_SCAN_HISTORY = 20;

// Same incremental paging as alert rules: only CVEs newer than each asset's cursor (plus any unread gap) are matched.
export async function matchInventoryForUser(
  userId: string,
  assets?: InventoryAssetRecord[]
): Promise<{ truncated: boolean }> {
  assets ??= await listInventoryAssetsForUser(userId);
  if (assets.length === 0) return { truncated: false };
  const cursors = readInventoryMatchCursors(userId);
  const { cves: sample, truncated, backfill } = await fetchLatestCVEsUntil(
    assets.map((asset) => cursors.get(asset.id) ?? null),
    readFeedBackfill(userId, "inventory")
  );
  const newestPublished = sample.reduce<string | null>(
    (newest, cve) => (cve.published && (!newest || Date.parse(cve.published) > Date.parse(newest)) ? cve.published : newest),
    null
  );
  for (const asset of assets) {
    recordInventoryAssetMatches(asset.id, sample.filter((cve) => matchesInventoryAsset(cve, asset)), newestPublished);
  }
  writeFeedBackfill(userId, "inventory", backfill);
  return { truncated };
}

export async function loadExposureQueueForUser(
  userId: string,
  { now = new Date(), includeHidden = false }: { now?: Date; includeHidden?: boolean } = {}
): Promise<ExposureQueue> {
  const [assets, repos] = await Promise.all([listInventoryAssetsForUser(userId), listMonitoredRepos(userId)]);
  if (assets.length === 0 && repos.length === 0) {
    return { rows: [], hiddenCount: 0, hasSources: false, truncated: false };
  }

  const { truncated } = await matchInventoryForUser(userId, assets);

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const inventoryRows = listInventoryAssetMatchesForUser(userId).flatMap(({ assetId, firstSeenAt, cve }): ExposureRow[] => {
    const asset = assetsById.get(assetId);
    if (!asset) return [];
    return [{
      key: exposureRowKey(cve.id, asset.id),
      vulnerabilityId: cve.id,
      source: "inventory",
      assetId: asset.id,
      assetLabel: `${asset.name} (${[asset.product, asset.version].filter(Boolean).join(" ")})`,
      criticality: asset.criticality,
      environment: asset.environment,
      isDev: null,
      repoFullName: null,
      firstSeenAt,
      cve,
    }];
  });

  const repoRows = (
    await Promise.all(repos.map(async (repo) => buildRepoExposureRows(repo, await listRepoScansForRepo(userId, repo.fullName, REPO_SCAN_HISTORY))))
  ).flat();

  // KEV/EPSS move daily, so enrich on read instead of trusting what was stored at match time.
  const rows = [...inventoryRows, ...repoRows];
  const enriched = await enrichCVEs(rows.map((row) => row.cve));
  const triage = readFindingTriageMap(userId);
  const queueRows = rows
    .map((row, index) => {
      const cve = enriched[index];
      const rowTriage = triage.get(row.key) ?? null;
      return { ...row, cve, ...getExposurePriority({ ...row, cve }), triage: rowTriage, hidden: isFindingTriageHidden(rowTriage, cve, now) };
    })
    .sort((a, b) => compareExposurePriority(a, b) || b.firstSeenAt.localeCompare(a.firstSeenAt));
  const visible = queueRows.filter((row) => !row.hidden);
  return {
    rows: includeHidden ? queueRows : visible,
    hiddenCount: queueRows.length - visible.length,
    hasSources: true,
    truncated,
  };
}
