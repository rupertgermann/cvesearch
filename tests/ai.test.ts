import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHeuristicAlertInvestigation,
  buildHeuristicCveInsight,
  buildHeuristicDigest,
  buildHeuristicExposureAssessment,
  buildHeuristicProjectSummary,
  buildHeuristicRemediationPlan,
  buildHeuristicTriageSuggestion,
  buildHeuristicWatchlistReview,
  getServerAIConfigurationSummary,
  interpretSearchPromptHeuristically,
  preparePromptInputForFeature,
} from "../src/lib/ai";

test("interpretSearchPromptHeuristically extracts severity and recent window", () => {
  const result = interpretSearchPromptHeuristically("show me critical OpenSSL vulns from this month");

  assert.equal(result.minSeverity, "CRITICAL");
  assert.equal(result.sort, "cvss_desc");
  assert.match(result.query, /openssl/i);
  assert.notEqual(result.since, "");
  assert.equal(result.appliedFilters.some((filter) => filter.field === "query"), true);
  assert.equal(result.toolCalls.length > 0, true);
  assert.equal(result.needsClarification, false);
});

test("interpretSearchPromptHeuristically requests clarification for underspecified prompts", () => {
  const result = interpretSearchPromptHeuristically("recent");

  assert.equal(result.needsClarification, true);
  assert.match(result.clarificationQuestion, /product|vendor|severity|time window/i);
});

test("buildHeuristicCveInsight produces triage and remediation guidance", () => {
  const result = buildHeuristicCveInsight({
    id: "CVE-2026-1111",
    cvss3: 9.8,
    summary: "Critical issue in OpenSSL",
    aliases: ["GHSA-xxxx-yyyy-zzzz"],
    containers: {
      cna: {
        affected: [{ product: "openssl", vendor: "openssl" }],
      },
    },
  });

  assert.equal(result.triage.priority, "critical");
  assert.equal(result.triage.confidence, "low");
  assert.equal(result.cluster.canonicalId, "CVE-2026-1111");
  assert.equal(result.remediation.length > 0, true);
  assert.equal(result.triage.signals.some((signal) => signal.label === "Severity"), true);
  assert.equal(result.projectContext.projectCount, 0);
});

test("buildHeuristicCveInsight incorporates epss triage workflow and project context", () => {
  const result = buildHeuristicCveInsight({
    detail: {
      id: "CVE-2026-2222",
      cvss3: 7.8,
      summary: "High-severity issue in a web edge component",
      references: ["https://vendor.example/advisory", "https://research.example/exploit-poc"],
      containers: {
        cna: {
          affected: [{ vendor: "acme", product: "edge-proxy" }],
          references: [{ url: "https://vendor.example/patch", tags: ["patch", "vendor-advisory"] }],
        },
      },
    },
    epss: {
      cve: "CVE-2026-2222",
      epss: 0.83,
      percentile: 0.96,
    },
    triage: {
      status: "investigating",
      owner: "edge-platform",
      notes: "Internet-facing service",
      tags: ["internet-facing"],
      updatedAt: "2026-03-06T10:00:00.000Z",
    },
    relatedProjects: [
      {
        name: "Edge Platform",
        updatedAt: "2026-03-06T10:00:00.000Z",
        items: [{ cveId: "CVE-2026-2222", addedAt: "2026-03-06T09:00:00.000Z" }],
      },
    ],
  });

  assert.equal(result.triage.priority, "high");
  assert.equal(result.triage.status, "investigating");
  assert.equal(result.triage.confidence, "high");
  assert.match(result.triage.ownerRecommendation, /edge-platform/i);
  assert.equal(result.triage.signals.some((signal) => signal.label === "EPSS"), true);
  assert.equal(result.triage.signals.some((signal) => signal.label === "Project impact"), true);
  assert.equal(result.projectContext.projectCount, 1);
  assert.deepEqual(result.projectContext.projectNames, ["Edge Platform"]);
});

test("buildHeuristicDigest summarizes watchlist, alerts, and projects", () => {
  const result = buildHeuristicDigest({
    watchlist: [{ id: "CVE-2026-1111" }],
    alerts: [{ name: "Critical OpenSSL", unread: 2, topMatches: ["CVE-2026-1111"] }],
    projects: [{ name: "Incident Alpha", updatedAt: "2026-03-05", items: [{ cveId: "CVE-2026-1111", addedAt: "2026-03-05" }] }],
  });

  assert.match(result.headline, /Critical OpenSSL|Tracking/);
  assert.equal(result.sections.length, 3);
});

test("buildHeuristicTriageSuggestion recommends owner, tags, and explicit approval", () => {
  const result = buildHeuristicTriageSuggestion({
    detail: {
      id: "CVE-2026-3333",
      cvss3: 9.1,
      summary: "Critical remote code execution in an internet-facing gateway",
      kev: {
        cveID: "CVE-2026-3333",
        vendorProject: "Acme",
        product: "Gateway",
        vulnerabilityName: "Gateway RCE",
        dateAdded: "2026-03-01",
        shortDescription: "Known exploited gateway issue",
        requiredAction: "Patch immediately",
        dueDate: "2026-03-08",
      },
      references: ["https://vendor.example/patch", "https://research.example/exploit-poc"],
    },
    epss: {
      cve: "CVE-2026-3333",
      epss: 0.91,
      percentile: 0.99,
    },
    triage: {
      status: "new",
      owner: "",
      notes: "",
      tags: ["internet-facing"],
      updatedAt: "2026-03-07T10:00:00.000Z",
    },
    relatedProjects: [
      {
        name: "Gateway Platform",
        updatedAt: "2026-03-07T10:00:00.000Z",
        items: [{ cveId: "CVE-2026-3333", addedAt: "2026-03-07T09:00:00.000Z" }],
      },
    ],
  });

  assert.equal(result.recommendation.priority, "critical");
  assert.equal(result.requiresHumanApproval, true);
  assert.equal(result.recommendedTags.includes("kev"), true);
  assert.equal(result.recommendedTags.includes("high-epss"), true);
  assert.match(result.recommendedOwner, /Gateway Platform owner|Security triage/i);
});

test("buildHeuristicRemediationPlan drafts controls, validation, and rollout notes", () => {
  const result = buildHeuristicRemediationPlan({
    detail: {
      id: "CVE-2026-4444",
      cvss3: 8.8,
      summary: "High severity issue in an edge gateway",
      references: ["https://vendor.example/advisory", "https://vendor.example/patch"],
      containers: {
        cna: {
          affected: [{ vendor: "Acme", product: "Edge Gateway" }],
          references: [{ url: "https://vendor.example/patch", tags: ["patch"] }],
        },
      },
    },
    epss: {
      cve: "CVE-2026-4444",
      epss: 0.77,
      percentile: 0.91,
    },
    triage: {
      status: "investigating",
      owner: "platform-security",
      notes: "Internet-facing edge service",
      tags: ["internet-facing"],
      updatedAt: "2026-03-07T11:00:00.000Z",
    },
    relatedProjects: [
      {
        name: "Edge Gateway",
        updatedAt: "2026-03-07T10:00:00.000Z",
        items: [{ cveId: "CVE-2026-4444", addedAt: "2026-03-07T09:00:00.000Z" }],
      },
    ],
  });

  assert.match(result.summary, /patch validation|version exposure validation/i);
  assert.equal(result.compensatingControls.length >= 3, true);
  assert.equal(result.validationSteps.length >= 3, true);
  assert.equal(result.rolloutNotes.length >= 3, true);
  assert.equal(result.requiresHumanApproval, true);
  assert.equal(result.recommendedOwner, "platform-security");
});

test("buildHeuristicWatchlistReview highlights changes and clusters", () => {
  const result = buildHeuristicWatchlistReview({
    previousReviewAt: "2026-03-07T08:00:00.000Z",
    items: [
      {
        id: "CVE-2026-5001",
        summary: "Critical issue in edge gateway",
        severity: "CRITICAL",
        kev: true,
        addedAt: "2026-03-07T09:00:00.000Z",
        triageStatus: "new",
        triageUpdatedAt: "2026-03-07T09:10:00.000Z",
        projectNames: ["Edge Gateway"],
        projectUpdatedAt: "2026-03-07T09:20:00.000Z",
        aliases: [],
        relatedIds: ["GHSA-edge-1"],
        affectedProducts: ["edge-gateway"],
        published: "2026-03-07T07:00:00.000Z",
        modified: "2026-03-07T09:30:00.000Z",
      },
      {
        id: "CVE-2026-5002",
        summary: "High issue in edge gateway plugin",
        severity: "HIGH",
        kev: false,
        addedAt: "2026-03-06T07:00:00.000Z",
        triageStatus: "investigating",
        triageUpdatedAt: "2026-03-07T08:30:00.000Z",
        projectNames: ["Edge Gateway"],
        projectUpdatedAt: "2026-03-07T08:45:00.000Z",
        aliases: [],
        relatedIds: ["GHSA-edge-1"],
        affectedProducts: ["edge-gateway"],
        published: "2026-03-05T07:00:00.000Z",
        modified: "2026-03-07T08:50:00.000Z",
      },
    ],
  });

  assert.match(result.headline, /change|active/i);
  assert.equal(result.newMatches.some((item) => item.includes("CVE-2026-5001")), true);
  assert.equal(result.changedSinceLastReview.length >= 2, true);
  assert.equal(result.clusters.length >= 1, true);
  assert.equal(result.recommendedActions.length >= 1, true);
});

test("buildHeuristicProjectSummary returns executive analyst and engineering views", () => {
  const result = buildHeuristicProjectSummary({
    project: {
      id: "project-1",
      name: "Edge Response",
      description: "",
      updatedAt: "2026-03-07T10:00:00.000Z",
      items: [
        { cveId: "CVE-2026-6001", addedAt: "2026-03-07T09:00:00.000Z" },
        { cveId: "CVE-2026-6002", addedAt: "2026-03-07T09:05:00.000Z" },
      ],
      activity: [{ id: "1", action: "project_item_added", summary: "Added CVEs", createdAt: "2026-03-07T10:30:00.000Z" }],
    },
    items: [
      {
        id: "CVE-2026-6001",
        summary: "Critical edge issue",
        severity: "CRITICAL",
        kev: true,
        triageStatus: "investigating",
        owner: "edge-platform",
        affectedProducts: ["edge-gateway"],
        published: "2026-03-07T09:00:00.000Z",
      },
      {
        id: "CVE-2026-6002",
        summary: "High plugin issue",
        severity: "HIGH",
        kev: false,
        triageStatus: "new",
        owner: "runtime-team",
        affectedProducts: ["edge-plugin"],
        published: "2026-03-07T08:00:00.000Z",
      },
    ],
  });

  assert.equal(result.projectName, "Edge Response");
  assert.equal(result.metrics.totalItems, 2);
  assert.equal(result.metrics.criticalCount, 1);
  assert.equal(result.metrics.kevCount, 1);
  assert.equal(result.executive.bullets.length >= 1, true);
  assert.equal(result.analyst.bullets.length >= 1, true);
  assert.equal(result.engineering.bullets.length >= 1, true);
});

test("buildHeuristicAlertInvestigation explains matches and recommends follow-up", () => {
  const result = buildHeuristicAlertInvestigation({
    rule: {
      id: "rule-1",
      name: "Critical Edge Alerts",
      lastCheckedAt: "2026-03-07T10:00:00.000Z",
      search: {
        query: "edge",
        vendor: "",
        product: "gateway",
        cwe: "",
        since: "",
        minSeverity: "HIGH",
        sort: "risk_desc",
        page: 1,
        perPage: 20,
      },
    },
    matches: [
      {
        id: "CVE-2026-8001",
        summary: "Critical gateway issue",
        severity: "CRITICAL",
        kev: true,
        published: "2026-03-07T09:00:00.000Z",
        modified: "2026-03-07T11:00:00.000Z",
        unread: true,
      },
      {
        id: "CVE-2026-8002",
        summary: "High gateway issue",
        severity: "HIGH",
        kev: false,
        published: "2026-03-07T08:00:00.000Z",
        modified: "2026-03-07T09:00:00.000Z",
        unread: false,
      },
    ],
  });

  assert.equal(result.ruleName, "Critical Edge Alerts");
  assert.equal(result.whyMatched.length >= 2, true);
  assert.equal(result.topMatches.length, 2);
  assert.match(result.recommendedAction, /unread|review/i);
});

test("buildHeuristicExposureAssessment maps CVEs to tracked inventory assets", () => {
  const result = buildHeuristicExposureAssessment({
    detail: {
      id: "CVE-2026-9001",
      cvss3: 9.0,
      summary: "Critical issue in Acme Gateway",
      containers: {
        cna: {
          affected: [{ vendor: "Acme", product: "Gateway" }],
        },
      },
      vulnerable_product: ["acme:gateway:1.2.3"],
    },
    triage: {
      status: "investigating",
      owner: "edge-security",
      notes: "Public entry point",
      tags: ["internet-facing"],
      updatedAt: "2026-03-07T12:00:00.000Z",
    },
    relatedProjects: [{ name: "Gateway Platform", updatedAt: "2026-03-07T12:00:00.000Z", items: [{ cveId: "CVE-2026-9001", addedAt: "2026-03-07T11:00:00.000Z" }] }],
    inventoryAssets: [{
      id: "asset-1",
      name: "Public API Gateway",
      vendor: "Acme",
      product: "Gateway",
      version: "1.2.x",
      environment: "production",
      criticality: "critical",
      notes: "Customer-facing edge entry point",
    }],
  });

  assert.equal(result.likelyImpact, "critical");
  assert.equal(result.matchedAssets.length, 1);
  assert.equal(result.matchedAssets[0]?.assetName, "Public API Gateway");
  assert.equal(result.recommendedActions.length >= 2, true);
});

test("preparePromptInputForFeature redacts sensitive notes and project metadata for external providers", () => {
  const previous = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AI_ALLOW_SENSITIVE_MODEL_DATA: process.env.AI_ALLOW_SENSITIVE_MODEL_DATA,
  };

  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-openai-key";
  delete process.env.AI_ALLOW_SENSITIVE_MODEL_DATA;

  try {
    const redacted = preparePromptInputForFeature("triage_agent", {
      detail: { id: "CVE-2026-7001" },
      epss: null,
      triage: {
        status: "investigating",
        owner: "platform-security",
        notes: "Customer-facing production edge cluster",
        tags: ["internet-facing"],
        updatedAt: "2026-03-07T12:00:00.000Z",
      },
      relatedProjects: [
        {
          name: "Top Secret Project",
          updatedAt: "2026-03-07T12:00:00.000Z",
          items: [{ cveId: "CVE-2026-7001", note: "Privileged note", addedAt: "2026-03-07T11:00:00.000Z" }],
        },
      ],
    });

    assert.equal(redacted.triage?.owner, "[redacted owner]");
    assert.equal(redacted.triage?.notes, "[redacted analyst notes]");
    assert.equal(redacted.relatedProjects[0]?.name, "Tracked project 1");
    assert.equal("note" in (redacted.relatedProjects[0]?.items[0] ?? {}), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("getServerAIConfigurationSummary applies per-feature provider and model overrides", () => {
  const previous = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    AI_SEARCH_ASSISTANT_PROVIDER: process.env.AI_SEARCH_ASSISTANT_PROVIDER,
    AI_SEARCH_ASSISTANT_MODEL: process.env.AI_SEARCH_ASSISTANT_MODEL,
    AI_CVE_INSIGHT_PROVIDER: process.env.AI_CVE_INSIGHT_PROVIDER,
    AI_CVE_INSIGHT_MODEL: process.env.AI_CVE_INSIGHT_MODEL,
    AI_DAILY_DIGEST_PROVIDER: process.env.AI_DAILY_DIGEST_PROVIDER,
    AI_DAILY_DIGEST_MODEL: process.env.AI_DAILY_DIGEST_MODEL,
    AI_TRIAGE_AGENT_PROVIDER: process.env.AI_TRIAGE_AGENT_PROVIDER,
    AI_TRIAGE_AGENT_MODEL: process.env.AI_TRIAGE_AGENT_MODEL,
    AI_REMEDIATION_AGENT_PROVIDER: process.env.AI_REMEDIATION_AGENT_PROVIDER,
    AI_REMEDIATION_AGENT_MODEL: process.env.AI_REMEDIATION_AGENT_MODEL,
    AI_WATCHLIST_ANALYST_PROVIDER: process.env.AI_WATCHLIST_ANALYST_PROVIDER,
    AI_WATCHLIST_ANALYST_MODEL: process.env.AI_WATCHLIST_ANALYST_MODEL,
    AI_PROJECT_SUMMARY_PROVIDER: process.env.AI_PROJECT_SUMMARY_PROVIDER,
    AI_PROJECT_SUMMARY_MODEL: process.env.AI_PROJECT_SUMMARY_MODEL,
    AI_ALERT_INVESTIGATION_PROVIDER: process.env.AI_ALERT_INVESTIGATION_PROVIDER,
    AI_ALERT_INVESTIGATION_MODEL: process.env.AI_ALERT_INVESTIGATION_MODEL,
    AI_EXPOSURE_AGENT_PROVIDER: process.env.AI_EXPOSURE_AGENT_PROVIDER,
    AI_EXPOSURE_AGENT_MODEL: process.env.AI_EXPOSURE_AGENT_MODEL,
    AI_ALLOW_SENSITIVE_MODEL_DATA: process.env.AI_ALLOW_SENSITIVE_MODEL_DATA,
  };

  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-global";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.ANTHROPIC_MODEL = "claude-global";
  process.env.AI_SEARCH_ASSISTANT_PROVIDER = "heuristic";
  process.env.AI_SEARCH_ASSISTANT_MODEL = "ignored-search-model";
  process.env.AI_CVE_INSIGHT_PROVIDER = "openai";
  process.env.AI_CVE_INSIGHT_MODEL = "gpt-cve";
  process.env.AI_DAILY_DIGEST_PROVIDER = "openai";
  process.env.AI_DAILY_DIGEST_MODEL = "gpt-digest";
  process.env.AI_TRIAGE_AGENT_PROVIDER = "anthropic";
  process.env.AI_TRIAGE_AGENT_MODEL = "claude-triage";
  process.env.AI_REMEDIATION_AGENT_PROVIDER = "openai";
  process.env.AI_REMEDIATION_AGENT_MODEL = "gpt-remediation";
  process.env.AI_WATCHLIST_ANALYST_PROVIDER = "anthropic";
  process.env.AI_WATCHLIST_ANALYST_MODEL = "claude-watchlist";
  process.env.AI_PROJECT_SUMMARY_PROVIDER = "openai";
  process.env.AI_PROJECT_SUMMARY_MODEL = "gpt-project";
  process.env.AI_ALERT_INVESTIGATION_PROVIDER = "anthropic";
  process.env.AI_ALERT_INVESTIGATION_MODEL = "claude-alerts";
  process.env.AI_EXPOSURE_AGENT_PROVIDER = "openai";
  process.env.AI_EXPOSURE_AGENT_MODEL = "gpt-exposure";
  delete process.env.AI_ALLOW_SENSITIVE_MODEL_DATA;

  try {
    const summary = getServerAIConfigurationSummary();
    const search = summary.featureConfigurations.find((item) => item.feature === "search_assistant");
    const cveInsight = summary.featureConfigurations.find((item) => item.feature === "cve_insight");
    const digest = summary.featureConfigurations.find((item) => item.feature === "daily_digest");
    const triageAgent = summary.featureConfigurations.find((item) => item.feature === "triage_agent");
    const remediationAgent = summary.featureConfigurations.find((item) => item.feature === "remediation_agent");
    const watchlistAnalyst = summary.featureConfigurations.find((item) => item.feature === "watchlist_analyst");
    const projectSummary = summary.featureConfigurations.find((item) => item.feature === "project_summary");
    const alertInvestigation = summary.featureConfigurations.find((item) => item.feature === "alert_investigation");
    const exposureAgent = summary.featureConfigurations.find((item) => item.feature === "exposure_agent");

    assert.equal(summary.provider, "openai");
    assert.equal(summary.model, "gpt-global");
    assert.equal(summary.redactionEnabledForExternalModels, true);
    assert.equal(summary.sensitiveDataAllowedToModels, false);
    assert.equal(search?.provider, "heuristic");
    assert.equal(search?.mode, "heuristic");
    assert.equal(search?.model, "");
    assert.equal(cveInsight?.provider, "openai");
    assert.equal(cveInsight?.model, "gpt-cve");
    assert.equal(digest?.provider, "openai");
    assert.equal(digest?.model, "gpt-digest");
    assert.equal(triageAgent?.provider, "anthropic");
    assert.equal(triageAgent?.model, "claude-triage");
    assert.equal(remediationAgent?.provider, "openai");
    assert.equal(remediationAgent?.model, "gpt-remediation");
    assert.equal(watchlistAnalyst?.provider, "anthropic");
    assert.equal(watchlistAnalyst?.model, "claude-watchlist");
    assert.equal(projectSummary?.provider, "openai");
    assert.equal(projectSummary?.model, "gpt-project");
    assert.equal(alertInvestigation?.provider, "anthropic");
    assert.equal(alertInvestigation?.model, "claude-alerts");
    assert.equal(exposureAgent?.provider, "openai");
    assert.equal(exposureAgent?.model, "gpt-exposure");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
