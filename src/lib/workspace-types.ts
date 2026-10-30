import { SearchState } from "./search";
import { TriageRecord } from "./triage-shared";
import { ProjectRecord } from "./types";

export interface SavedView {
  id: string;
  name: string;
  search: SearchState;
  createdAt: string;
}

export interface PromptTemplateRecord {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRule {
  id: string;
  name: string;
  search: SearchState;
  createdAt: string;
  lastCheckedAt: string | null;
  // Only set when read from the store; imports and new rules omit it.
  unreadCount?: number;
}

export type NotificationChannel = "in_app" | "email" | "slack" | "webhook";
export type NotificationCadence = "daily" | "weekly";

export interface NotificationPreferenceRecord {
  id: string;
  teamName: string;
  channel: NotificationChannel;
  destination: string;
  cadence: NotificationCadence;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastSentAt: string | null;
  nextRunAt: string | null;
}

export interface NotificationDeliveryRecord {
  id: string;
  preferenceId: string;
  teamName: string;
  channel: NotificationChannel;
  destination: string;
  cadence: NotificationCadence;
  headline: string;
  summary: string;
  status: "sent" | "failed" | "preview";
  error?: string;
  itemCount: number;
  createdAt: string;
  deliveredAt: string | null;
}

export interface WorkspaceConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  references: string[];
}

export interface WorkspaceConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: WorkspaceConversationMessage[];
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
  promptTemplates: PromptTemplateRecord[];
  alertRules: AlertRule[];
  inventoryAssets: InventoryAssetRecord[];
  triageRecords: TriageRecord[];
  projects: ProjectRecord[];
  notificationPreferences?: NotificationPreferenceRecord[];
  conversations?: WorkspaceConversationRecord[];
}

export type WorkspaceImportMode = "merge" | "replace";
