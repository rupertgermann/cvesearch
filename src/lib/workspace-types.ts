import { SearchState } from "./search";
import { TriageRecord } from "./triage-shared";
import { ProjectRecord } from "./types";

export interface SavedView {
  id: string;
  name: string;
  search: SearchState;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  name: string;
  search: SearchState;
  createdAt: string;
  lastCheckedAt: string | null;
}

export interface InventoryAssetRecord {
  id: string;
  name: string;
  vendor: string;
  product: string;
  version: string;
  environment: string;
  criticality: "critical" | "high" | "medium" | "low";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceExportSnapshot {
  version: 1;
  exportedAt: string;
  watchlist: string[];
  savedViews: SavedView[];
  alertRules: AlertRule[];
  inventoryAssets: InventoryAssetRecord[];
  triageRecords: TriageRecord[];
  projects: ProjectRecord[];
}

export type WorkspaceImportMode = "merge" | "replace";
