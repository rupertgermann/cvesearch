import {
  buildRepoExposureRows,
  compareExposurePriority,
  ExposureQueue,
  ExposureRow,
  exposureRowKey,
  getExposurePriority,
  matchesInventoryAsset,
} from "./exposure";
import { listMonitoredRepos } from "./monitored-repos-store";
import { listRepoScansForRepo } from "./repo-scans-store";
import { enrichCVEs } from "./server-api";
import { fetchLatestCVEsUntil } from "./workspace-context";
import {
  listInventoryAssetMatchesForUser,
  listInventoryAssetsForUser,
  readInventoryMatchCursors,
  recordInventoryAssetMatches,
} from "./workspace-store";

// Scans looked at when working out a repo finding's first-seen date.
const REPO_SCAN_HISTORY = 20;

export async function loadExposureQueueForUser(userId: string): Promise<ExposureQueue> {
  const [assets, repos] = await Promise.all([listInventoryAssetsForUser(userId), listMonitoredRepos(userId)]);
  if (assets.length === 0 && repos.length === 0) {
    return { rows: [], hasSources: false, truncated: false };
  }

  // Same incremental paging as alert rules: only CVEs newer than each asset's cursor are fetched and matched.
  const cursors = readInventoryMatchCursors(userId);
  const { cves: sample, truncated } = await fetchLatestCVEsUntil(assets.map((asset) => cursors.get(asset.id) ?? null));
  const newestPublished = sample.reduce<string | null>(
    (newest, cve) => (cve.published && (!newest || Date.parse(cve.published) > Date.parse(newest)) ? cve.published : newest),
    null
  );
  for (const asset of assets) {
    recordInventoryAssetMatches(asset.id, sample.filter((cve) => matchesInventoryAsset(cve, asset)), newestPublished);
  }

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
  return {
    rows: rows
      .map((row, index) => {
        const next = { ...row, cve: enriched[index] };
        return { ...next, ...getExposurePriority(next) };
      })
      .sort((a, b) => compareExposurePriority(a, b) || b.firstSeenAt.localeCompare(a.firstSeenAt)),
    hasSources: true,
    truncated,
  };
}
