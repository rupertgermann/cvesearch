import { SearchState, normalizeSearchState } from "./search";
import { AIProvider, AISettings, CVEDetail, AICveInsight, AIDigest, AISearchInterpretation, ProjectRecord } from "./types";
import { extractCVEId, extractDescription, getSeverityFromScore } from "./utils";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";

export interface DigestInput {
  watchlist: Array<{ id: string; summary?: string; severity?: string }>;
  alerts: Array<{ name: string; unread: number; topMatches: string[] }>;
  projects: Pick<ProjectRecord, "name" | "items" | "updatedAt">[];
}

export async function generateCveInsight(detail: CVEDetail, settings?: Partial<AISettings>): Promise<AICveInsight> {
  const runtime = resolveAISettings(settings);
  if (runtime.provider === "heuristic") {
    return buildHeuristicCveInsight(detail);
  }

  try {
    const prompt = [
      "You are a security analyst assistant.",
      "Return only valid JSON matching this TypeScript shape:",
      '{"summary":"string","triage":{"priority":"critical|high|medium|low","status":"new|investigating|mitigated|accepted|closed","rationale":"string","nextSteps":["string"]},"remediation":["string"],"cluster":{"canonicalId":"string","sourceIds":["string"],"relatedIds":["string"],"summary":"string"}}',
      "Base your answer only on this CVE detail JSON:",
      JSON.stringify(detail),
    ].join("\n");

    const response = await callModel(prompt, runtime);
    return sanitizeInsight(JSON.parse(response));
  } catch {
    return buildHeuristicCveInsight(detail);
  }
}

export async function generateSearchInterpretation(prompt: string, settings?: Partial<AISettings>): Promise<AISearchInterpretation> {
  const runtime = resolveAISettings(settings);
  if (runtime.provider === "heuristic") {
    return interpretSearchPromptHeuristically(prompt);
  }

  try {
    const modelPrompt = [
      "Convert this vulnerability search request into filters.",
      "Return only valid JSON with keys query, vendor, product, cwe, since, minSeverity, sort, explanation.",
      'Allowed minSeverity: "ANY" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL".',
      'Allowed sort: "published_desc" | "published_asc" | "cvss_desc" | "cvss_asc".',
      `Request: ${prompt}`,
    ].join("\n");

    const response = await callModel(modelPrompt, runtime);
    return sanitizeSearchInterpretation(JSON.parse(response));
  } catch {
    return interpretSearchPromptHeuristically(prompt);
  }
}

export async function generateDigest(input: DigestInput, settings?: Partial<AISettings>): Promise<AIDigest> {
  const runtime = resolveAISettings(settings);
  if (runtime.provider === "heuristic") {
    return buildHeuristicDigest(input);
  }

  try {
    const prompt = [
      "You are producing a concise vulnerability monitoring digest.",
      "Return only valid JSON matching this shape:",
      '{"headline":"string","sections":[{"title":"string","body":"string","items":["string"]}]}',
      "Use this input JSON:",
      JSON.stringify(input),
    ].join("\n");

    const response = await callModel(prompt, runtime);
    return sanitizeDigest(JSON.parse(response));
  } catch {
    return buildHeuristicDigest(input);
  }
}

export function buildHeuristicCveInsight(detail: CVEDetail): AICveInsight {
  const id = extractCVEId(detail);
  const severityScore = detail.cvss3 ?? detail.cvss;
  const severity = getSeverityFromScore(severityScore);
  const description = extractDescription(detail);
  const affected = detail.containers?.cna?.affected?.slice(0, 3) ?? [];
  const aliases = detail.aliases ?? [];
  const relatedIds = extractRelatedIds(detail);
  const priority = severity === "CRITICAL" ? "critical" : severity === "HIGH" ? "high" : severity === "MEDIUM" ? "medium" : "low";
  const status = priority === "critical" || priority === "high" ? "investigating" : "new";

  return {
    summary: `${id} is a ${severity.toLowerCase()} severity vulnerability${affected.length ? ` affecting ${affected.map((item) => item.product || item.vendor).filter(Boolean).join(", ")}` : ""}. ${truncateSentence(description)}`,
    triage: {
      priority,
      status,
      rationale:
        priority === "critical" || priority === "high"
          ? "High severity and affected product exposure suggest immediate analyst review."
          : "The record is lower severity or missing severity context, so review is still useful but less urgent.",
      nextSteps: [
        "Confirm whether the affected product or version exists in your environment.",
        "Review upstream references for patches, advisories, or mitigation guidance.",
        "Track ownership and remediation notes in triage before closing the issue.",
      ],
    },
    remediation: [
      "Identify exposed versions and compare them against vendor-fixed releases.",
      "Apply patches or compensating controls where an immediate upgrade is not possible.",
      "Validate remediation with version checks, changelog confirmation, or environment-specific testing.",
    ],
    cluster: {
      canonicalId: id,
      sourceIds: aliases.filter((alias) => alias !== id),
      relatedIds,
      summary:
        relatedIds.length > 0
          ? "This issue appears alongside linked advisories or aliases and should be reviewed as part of a broader context cluster."
          : "This issue currently stands alone in the available alias and linked-vulnerability context.",
    },
  };
}

export function interpretSearchPromptHeuristically(prompt: string): AISearchInterpretation {
  const lower = prompt.toLowerCase();
  const cveMatch = prompt.match(/CVE-\d{4}-\d+/i);
  const cweMatch = prompt.match(/CWE-\d+/i);
  const minSeverity = lower.includes("critical")
    ? "CRITICAL"
    : lower.includes("high")
      ? "HIGH"
      : lower.includes("medium")
        ? "MEDIUM"
        : lower.includes("low")
          ? "LOW"
          : "ANY";
  const since = lower.includes("this week")
    ? isoDateDaysAgo(7)
    : lower.includes("today")
      ? isoDateDaysAgo(1)
      : lower.includes("this month")
        ? isoDateDaysAgo(30)
        : "";

  const cleanedQuery = cveMatch
    ? cveMatch[0].toUpperCase()
    : prompt
        .replace(/show me|find|search for|vulns?|vulnerabilities|from this week|from this month|today|critical|high|medium|low/gi, " ")
        .trim()
        .replace(/\s+/g, " ");

  return sanitizeSearchInterpretation({
    query: cleanedQuery,
    vendor: "",
    product: "",
    cwe: cweMatch?.[0].toUpperCase() ?? "",
    since,
    minSeverity,
    sort: minSeverity === "ANY" ? "published_desc" : "cvss_desc",
    explanation: "Interpreted your natural-language search into query, severity, and time filters.",
  });
}

export function buildHeuristicDigest(input: DigestInput): AIDigest {
  const highestAlert = [...input.alerts].sort((a, b) => b.unread - a.unread)[0];
  const activeProjects = input.projects.filter((project) => project.items.length > 0);

  return {
    headline:
      highestAlert && highestAlert.unread > 0
        ? `${highestAlert.unread} unread matches in ${highestAlert.name}`
        : `Tracking ${input.watchlist.length} watchlist items across ${activeProjects.length} projects`,
    sections: [
      {
        title: "Watchlist",
        body: `You have ${input.watchlist.length} tracked vulnerabilities in the current browser profile.`,
        items: input.watchlist.slice(0, 5).map((item) => item.id),
      },
      {
        title: "Alerts",
        body:
          input.alerts.length > 0
            ? `${input.alerts.filter((item) => item.unread > 0).length} alert rules currently have unread matches.`
            : "No alert rules are configured yet.",
        items: input.alerts.slice(0, 5).map((item) => `${item.name}: ${item.unread} unread`),
      },
      {
        title: "Projects",
        body:
          activeProjects.length > 0
            ? `${activeProjects.length} projects currently contain tracked CVEs.`
            : "No projects contain tracked CVEs yet.",
        items: activeProjects.slice(0, 5).map((project) => `${project.name}: ${project.items.length} CVEs`),
      },
    ],
  };
}

export async function callModel(prompt: string, settings: AISettings): Promise<string> {
  if (settings.provider === "anthropic") {
    return callAnthropic(prompt, settings);
  }
  return callOpenAI(prompt, settings);
}

async function callOpenAI(prompt: string, settings: AISettings): Promise<string> {
  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "Return only JSON. No markdown. No prose outside JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI error: ${res.status}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI response did not include content");
  }

  return content;
}

async function callAnthropic(prompt: string, settings: AISettings): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 800,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: `Return only JSON. No markdown. No prose outside JSON.\n\n${prompt}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic error: ${res.status}`);
  }

  const data = await res.json();
  const content = data?.content?.find?.((item: { type?: string }) => item.type === "text")?.text;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Anthropic response did not include content");
  }

  return content;
}

function sanitizeInsight(value: unknown): AICveInsight {
  const fallback = buildHeuristicCveInsight({ id: "CVE-UNKNOWN" });
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;

  return {
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
    triage: sanitizeTriage(record.triage, fallback.triage),
    remediation: Array.isArray(record.remediation) ? record.remediation.filter((item): item is string => typeof item === "string").slice(0, 6) : fallback.remediation,
    cluster: sanitizeCluster(record.cluster, fallback.cluster),
  };
}

function sanitizeSearchInterpretation(value: unknown): AISearchInterpretation {
  if (!value || typeof value !== "object") {
    return interpretSearchPromptHeuristically("");
  }

  const normalized = normalizeSearchState(value as Partial<SearchState>);
  return {
    query: normalized.query,
    vendor: normalized.vendor,
    product: normalized.product,
    cwe: normalized.cwe,
    since: normalized.since,
    minSeverity: normalized.minSeverity,
    sort: normalized.sort,
    explanation:
      typeof (value as Record<string, unknown>).explanation === "string"
        ? ((value as Record<string, unknown>).explanation as string)
        : "Generated a structured search interpretation.",
  };
}

function sanitizeDigest(value: unknown): AIDigest {
  if (!value || typeof value !== "object") {
    return buildHeuristicDigest({ watchlist: [], alerts: [], projects: [] });
  }

  const record = value as Record<string, unknown>;
  return {
    headline: typeof record.headline === "string" ? record.headline : "AI digest",
    sections: Array.isArray(record.sections)
      ? record.sections
          .filter((section): section is Record<string, unknown> => Boolean(section) && typeof section === "object")
          .map((section) => ({
            title: typeof section.title === "string" ? section.title : "Section",
            body: typeof section.body === "string" ? section.body : "",
            items: Array.isArray(section.items)
              ? section.items.filter((item): item is string => typeof item === "string").slice(0, 8)
              : [],
          }))
      : [],
  };
}

function sanitizeTriage(value: unknown, fallback: AICveInsight["triage"]): AICveInsight["triage"] {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    priority:
      record.priority === "critical" || record.priority === "high" || record.priority === "medium" || record.priority === "low"
        ? record.priority
        : fallback.priority,
    status:
      record.status === "new" || record.status === "investigating" || record.status === "mitigated" || record.status === "accepted" || record.status === "closed"
        ? record.status
        : fallback.status,
    rationale: typeof record.rationale === "string" ? record.rationale : fallback.rationale,
    nextSteps: Array.isArray(record.nextSteps)
      ? record.nextSteps.filter((item): item is string => typeof item === "string").slice(0, 6)
      : fallback.nextSteps,
  };
}

function sanitizeCluster(value: unknown, fallback: AICveInsight["cluster"]): AICveInsight["cluster"] {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    canonicalId: typeof record.canonicalId === "string" ? record.canonicalId : fallback.canonicalId,
    sourceIds: Array.isArray(record.sourceIds) ? record.sourceIds.filter((item): item is string => typeof item === "string").slice(0, 10) : fallback.sourceIds,
    relatedIds: Array.isArray(record.relatedIds) ? record.relatedIds.filter((item): item is string => typeof item === "string").slice(0, 10) : fallback.relatedIds,
    summary: typeof record.summary === "string" ? record.summary : fallback.summary,
  };
}

function extractRelatedIds(detail: CVEDetail): string[] {
  const related = new Set<string>();
  for (const alias of detail.aliases ?? []) {
    related.add(alias);
  }

  const record = detail as unknown as Record<string, unknown>;
  for (const key of ["linked_vulnerabilities", "related_vulnerabilities", "vulnerabilities", "related"]) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === "string") related.add(item);
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        for (const field of ["id", "cve", "vulnerability"]) {
          if (typeof obj[field] === "string") {
            related.add(obj[field] as string);
          }
        }
      }
    }
  }

  related.delete(extractCVEId(detail));
  return Array.from(related).slice(0, 10);
}

function truncateSentence(input: string, max = 220): string {
  const trimmed = input.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}...`;
}

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function resolveAISettings(settings?: Partial<AISettings>): AISettings {
  const provider = settings?.provider ?? (process.env.OPENAI_API_KEY ? "openai" : "heuristic");
  const apiKey =
    settings?.apiKey ??
    (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) ??
    "";
  const model =
    settings?.model ??
    (provider === "anthropic" ? process.env.ANTHROPIC_MODEL : process.env.OPENAI_MODEL) ??
    "";

  if (provider !== "heuristic" && !apiKey) {
    return {
      provider: "heuristic",
      model: "",
      apiKey: "",
    };
  }

  return {
    provider: provider as AIProvider,
    model,
    apiKey,
  };
}
