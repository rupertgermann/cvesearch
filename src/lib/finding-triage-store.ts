import { getDb } from "./db";
import { FINDING_TRIAGE_STATUSES, FindingTriage, FindingTriageStatus } from "./exposure";
import type { SeverityLevel } from "./types";

const SEVERITIES: SeverityLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE", "UNKNOWN"];
const MAX_KEY_LENGTH = 400;
const MAX_REASON_LENGTH = 2000;

interface FindingTriageRow {
  finding_key: string;
  status: string;
  reason: string;
  accepted_until: string | null;
  kev_at_acceptance: number | null;
  severity_at_acceptance: string | null;
  updated_at: string;
}

export function readFindingTriageMap(userId: string): Map<string, FindingTriage> {
  const rows = getDb().prepare(`
    SELECT finding_key, status, reason, accepted_until, kev_at_acceptance, severity_at_acceptance, updated_at
    FROM user_finding_triage WHERE user_id = ?
  `).all(userId) as unknown as FindingTriageRow[];
  return new Map(rows.map((row) => [row.finding_key, {
    key: row.finding_key,
    status: row.status as FindingTriageStatus,
    reason: row.reason,
    acceptedUntil: row.accepted_until,
    kevAtAcceptance: row.kev_at_acceptance === null ? null : row.kev_at_acceptance === 1,
    severityAtAcceptance: row.severity_at_acceptance as SeverityLevel | null,
    updatedAt: row.updated_at,
  }]));
}

export function writeFindingTriage(userId: string, triage: FindingTriage): FindingTriage {
  getDb().prepare(`
    INSERT INTO user_finding_triage (user_id, finding_key, status, reason, accepted_until, kev_at_acceptance, severity_at_acceptance, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, finding_key) DO UPDATE SET
      status = excluded.status, reason = excluded.reason, accepted_until = excluded.accepted_until,
      kev_at_acceptance = excluded.kev_at_acceptance, severity_at_acceptance = excluded.severity_at_acceptance,
      updated_at = excluded.updated_at
  `).run(
    userId,
    triage.key,
    triage.status,
    triage.reason,
    triage.acceptedUntil,
    triage.kevAtAcceptance === null ? null : Number(triage.kevAtAcceptance),
    triage.severityAtAcceptance,
    triage.updatedAt
  );
  return triage;
}

// Validates a client body. Accepted risk needs a reason, an expiry date and the KEV/severity the user saw.
export function parseFindingTriageInput(body: unknown, now: Date): FindingTriage | { error: string } {
  if (!body || typeof body !== "object") return { error: "triage body is required" };
  const input = body as Record<string, unknown>;
  const { key, status } = input;
  if (typeof key !== "string" || !key.includes("::") || key.length > MAX_KEY_LENGTH) return { error: "key must be an exposure row key" };
  if (!FINDING_TRIAGE_STATUSES.includes(status as FindingTriageStatus)) return { error: `status must be one of ${FINDING_TRIAGE_STATUSES.join(", ")}` };
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length > MAX_REASON_LENGTH) return { error: `reason must be at most ${MAX_REASON_LENGTH} characters` };
  const base = { key, status: status as FindingTriageStatus, reason, updatedAt: now.toISOString() };

  if (status !== "accepted_risk") {
    return { ...base, acceptedUntil: null, kevAtAcceptance: null, severityAtAcceptance: null };
  }

  const { acceptedUntil, kev, severity } = input;
  if (!reason) return { error: "accepted risk needs a reason" };
  if (
    typeof acceptedUntil !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(acceptedUntil)
    || Number.isNaN(Date.parse(`${acceptedUntil}T00:00:00Z`))
    || new Date(`${acceptedUntil}T00:00:00Z`).toISOString().slice(0, 10) !== acceptedUntil
  ) {
    return { error: "acceptedUntil must be a YYYY-MM-DD date" };
  }
  if (typeof kev !== "boolean" || !SEVERITIES.includes(severity as SeverityLevel)) {
    return { error: "accepted risk needs the finding's current kev flag and severity" };
  }
  return { ...base, acceptedUntil, kevAtAcceptance: kev, severityAtAcceptance: severity as SeverityLevel };
}
