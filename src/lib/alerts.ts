import { SearchState, normalizeSearchState } from "./search";

const ALERT_RULES_STORAGE_KEY = "cvesearch.alert-rules";
export const ALERT_RULES_UPDATED_EVENT = "cvesearch:alert-rules-updated";

export interface AlertRule {
  id: string;
  name: string;
  search: SearchState;
  createdAt: string;
  lastCheckedAt: string | null;
}

export function readAlertRules(): AlertRule[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(ALERT_RULES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAlertRule).map(normalizeAlertRule) : [];
  } catch {
    return [];
  }
}

export function saveAlertRule(name: string, search: SearchState): AlertRule[] {
  const current = readAlertRules();
  const next: AlertRule[] = [
    {
      id: crypto.randomUUID(),
      name: name.trim(),
      search: normalizeSearchState(search),
      createdAt: new Date().toISOString(),
      lastCheckedAt: null,
    },
    ...current,
  ];

  writeAlertRules(next);
  return next;
}

export function deleteAlertRule(id: string): AlertRule[] {
  const next = readAlertRules().filter((rule) => rule.id !== id);
  writeAlertRules(next);
  return next;
}

export function markAlertRuleChecked(id: string): AlertRule[] {
  const now = new Date().toISOString();
  const next = readAlertRules().map((rule) =>
    rule.id === id ? { ...rule, lastCheckedAt: now } : rule
  );
  writeAlertRules(next);
  return next;
}

export function markAllAlertRulesChecked(): AlertRule[] {
  const now = new Date().toISOString();
  const next = readAlertRules().map((rule) => ({ ...rule, lastCheckedAt: now }));
  writeAlertRules(next);
  return next;
}

function writeAlertRules(rules: AlertRule[]): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(ALERT_RULES_STORAGE_KEY, JSON.stringify(rules));
  window.dispatchEvent(new CustomEvent(ALERT_RULES_UPDATED_EVENT));
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

function normalizeAlertRule(rule: AlertRule): AlertRule {
  return {
    ...rule,
    search: normalizeSearchState(rule.search),
    lastCheckedAt: typeof rule.lastCheckedAt === "string" ? rule.lastCheckedAt : null,
  };
}
