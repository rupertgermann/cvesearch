import { SearchState } from "./search";
import { TriageRecord } from "./triage-shared";

export interface AlertRule {
  id: string;
  name: string;
  search: SearchState;
  createdAt: string;
  lastCheckedAt: string | null;
  // Only set when read from the store; imports and new rules omit it.
  unreadCount?: number;
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
  alertRules: AlertRule[];
  inventoryAssets: InventoryAssetRecord[];
  triageRecords: TriageRecord[];
}

export type WorkspaceImportMode = "merge" | "replace";
