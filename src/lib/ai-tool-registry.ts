import { AIFeature } from "./types";

export interface AIToolDefinition {
  name: string;
  description: string;
  access: "read" | "write";
  features: AIFeature[];
}

const AI_TOOL_REGISTRY: AIToolDefinition[] = [
  {
    name: "search_cves",
    description: "Search CVE summaries with structured filters and prioritization.",
    access: "read",
    features: ["search_assistant", "daily_digest", "watchlist_analyst"],
  },
  {
    name: "fetch_cve_details",
    description: "Fetch detailed CVE records, severity data, references, and exploit context.",
    access: "read",
    features: ["cve_insight", "daily_digest", "triage_agent", "remediation_agent", "watchlist_analyst"],
  },
  {
    name: "read_watchlist_state",
    description: "Read workspace watchlist records and tracked CVE identifiers.",
    access: "read",
    features: ["daily_digest", "watchlist_analyst"],
  },
  {
    name: "read_alert_rule_matches",
    description: "Read alert rules and the CVEs that currently match them.",
    access: "read",
    features: ["daily_digest"],
  },
  {
    name: "read_project_records",
    description: "Read project groupings, audit history, and linked CVE items.",
    access: "read",
    features: ["cve_insight", "daily_digest", "triage_agent", "remediation_agent", "watchlist_analyst"],
  },
  {
    name: "write_project_records",
    description: "Add or update project records after an explicit approval checkpoint.",
    access: "write",
    features: ["cve_insight"],
  },
  {
    name: "read_triage_state",
    description: "Read user-scoped triage notes, ownership, tags, and workflow status.",
    access: "read",
    features: ["cve_insight", "daily_digest", "triage_agent", "remediation_agent", "watchlist_analyst"],
  },
  {
    name: "write_triage_state",
    description: "Update triage state after an explicit human approval checkpoint.",
    access: "write",
    features: ["cve_insight", "triage_agent"],
  },
];

export function listAITools(feature?: AIFeature): AIToolDefinition[] {
  if (!feature) {
    return [...AI_TOOL_REGISTRY];
  }

  return AI_TOOL_REGISTRY.filter((tool) => tool.features.includes(feature));
}
