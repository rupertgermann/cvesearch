import { SearchState } from "./search";
import { AlertRule } from "./workspace-types";
import type { EvaluatedAlertRule } from "./workspace-context";

export const ALERT_RULES_UPDATED_EVENT = "cvesearch:alert-rules-updated";
// Separate from ALERT_RULES_UPDATED_EVENT: the alerts page re-evaluates on that one, so reusing it would loop.
export const ALERT_UNREAD_UPDATED_EVENT = "cvesearch:alert-unread-updated";

let alertRulesCache: AlertRule[] = [];
let alertRulesLoaded = false;
let alertRulesPromise: Promise<AlertRule[]> | null = null;

export type { AlertRule };

export interface AlertEvaluationsPayload {
  evaluations: EvaluatedAlertRule[];
  sampledCount: number;
  truncated: boolean;
}

export async function loadAlertRules(): Promise<AlertRule[]> {
  if (alertRulesLoaded) {
    return alertRulesCache;
  }

  if (alertRulesPromise) {
    return alertRulesPromise;
  }

  alertRulesPromise = fetchAlertRules()
    .then((next) => {
      alertRulesCache = next;
      alertRulesLoaded = true;
      return next;
    })
    .catch(() => alertRulesCache)
    .finally(() => {
      alertRulesPromise = null;
    });

  return alertRulesPromise;
}

export function readAlertRules(): AlertRule[] {
  return alertRulesCache;
}

export async function saveAlertRule(name: string, search: SearchState): Promise<AlertRule[]> {
  await mutateAlertRules("/api/alerts", {
    method: "POST",
    body: JSON.stringify({ name, search }),
  });
  return refreshAlertRules();
}

export async function deleteAlertRule(id: string): Promise<AlertRule[]> {
  await mutateAlertRules(`/api/alerts/${encodeURIComponent(id)}`, { method: "DELETE" });
  return refreshAlertRules();
}

export async function markAlertRuleChecked(id: string): Promise<AlertRule[]> {
  const res = await fetch(`/api/alerts/${encodeURIComponent(id)}`, { method: "PATCH" });
  if (!res.ok) {
    throw new Error("Failed to mark alert rule checked");
  }

  const data = await res.json().catch(() => []);
  const next = Array.isArray(data) ? data.filter(isAlertRule) : [];
  alertRulesCache = next;
  alertRulesLoaded = true;
  dispatchAlertRulesUpdated();
  return next;
}

export async function markAllAlertRulesChecked(): Promise<AlertRule[]> {
  const res = await fetch("/api/alerts/mark-all", { method: "POST" });
  if (!res.ok) {
    throw new Error("Failed to mark all alerts checked");
  }

  const data = await res.json().catch(() => []);
  const next = Array.isArray(data) ? data.filter(isAlertRule) : [];
  alertRulesCache = next;
  alertRulesLoaded = true;
  dispatchAlertRulesUpdated();
  return next;
}

export async function loadAlertEvaluations(): Promise<AlertEvaluationsPayload> {
  const res = await fetch("/api/alerts/evaluations", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to load alert evaluations");
  }

  const data = await res.json().catch(() => null);
  const evaluations: EvaluatedAlertRule[] = Array.isArray(data?.evaluations) ? data.evaluations.filter(isEvaluatedAlertRule) : [];

  // Evaluation stores new matches, so the cached unread counts are stale now.
  alertRulesCache = evaluations.map((item) => ({ ...item.rule, unreadCount: item.unread }));
  alertRulesLoaded = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ALERT_UNREAD_UPDATED_EVENT));
  }

  return {
    evaluations,
    sampledCount: typeof data?.sampledCount === "number" ? data.sampledCount : 0,
    truncated: data?.truncated === true,
  };
}

async function refreshAlertRules(): Promise<AlertRule[]> {
  const next = await fetchAlertRules();
  alertRulesCache = next;
  alertRulesLoaded = true;
  dispatchAlertRulesUpdated();
  return next;
}

function dispatchAlertRulesUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ALERT_RULES_UPDATED_EVENT));
  }
}

async function fetchAlertRules(): Promise<AlertRule[]> {
  const res = await fetch("/api/alerts", { cache: "no-store" });
  if (!res.ok) {
    return [];
  }

  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data.filter(isAlertRule) : [];
}

async function mutateAlertRules(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error("Alert rules request failed");
  }
}

function isAlertRule(value: unknown): value is AlertRule {
  if (!value || typeof value !== "object") return false;

  return (
    "id" in value &&
    "name" in value &&
    "search" in value &&
    "createdAt" in value &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.search === "object" &&
    typeof value.createdAt === "string"
  );
}

function isEvaluatedAlertRule(value: unknown): value is EvaluatedAlertRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "rule" in value &&
    "matching" in value &&
    "unread" in value &&
    isAlertRule(value.rule) &&
    Array.isArray(value.matching) &&
    typeof value.unread === "number"
  );
}
