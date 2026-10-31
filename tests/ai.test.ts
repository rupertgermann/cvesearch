import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHeuristicRemediationPlan,
  callModel,
  getServerAIConfigurationSummary,
  interpretSearchPromptHeuristically,
  prepareRemediationPromptInput,
} from "../src/lib/ai";
import { buildDigest } from "../src/lib/workspace-context";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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

test("interpretSearchPromptHeuristically maps aliases, CWE families, and exploit intent", () => {
  const result = interpretSearchPromptHeuristically("show me xss vulns in k8s with proof of concept exploits from this week");

  assert.equal(result.vendor, "Kubernetes");
  assert.equal(result.product, "Kubernetes");
  assert.equal(result.cwe, "CWE-79");
  assert.equal(result.sort, "risk_desc");
  assert.notEqual(result.since, "");
  assert.equal(result.appliedFilters.some((filter) => filter.field === "product" && /Kubernetes/.test(filter.value)), true);
});

test("interpretSearchPromptHeuristically understands explicit date windows and remediation intent", () => {
  const result = interpretSearchPromptHeuristically("what should we patch first for microsoft exchange since 2026-01-15");

  assert.equal(result.vendor, "Microsoft");
  assert.equal(result.product, "Exchange");
  assert.equal(result.since, "2026-01-15");
  assert.equal(result.sort, "risk_desc");
  assert.equal(result.needsClarification, false);
});

test("buildDigest summarizes watchlist, alerts, and projects", () => {
  const result = buildDigest({
    watchlist: [{ id: "CVE-2026-1111" }],
    alerts: [{ name: "Critical OpenSSL", unread: 2, topMatches: ["CVE-2026-1111"] }],
    projects: [{ name: "Incident Alpha", updatedAt: "2026-03-05", items: [{ cveId: "CVE-2026-1111", addedAt: "2026-03-05" }] }],
  });

  assert.match(result.headline, /Critical OpenSSL|Tracking/);
  assert.equal(result.sections.length, 3);
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

test("callModel uses the OpenAI Responses API for all OpenAI models", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push({ url, body });

    return jsonResponse({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "{\"ok\":true}",
            },
          ],
        },
      ],
    });
  }) as typeof fetch;

  try {
    const models = ["gpt-5-mini", "gpt-4o-mini"];

    for (const model of models) {
      const result = await callModel("generate json", {
        provider: "openai",
        model,
        apiKey: "test-openai-key",
      });

      assert.equal(result, "{\"ok\":true}");
    }

    assert.equal(requests.length, models.length);
    for (const [index, request] of requests.entries()) {
      assert.equal(request.url, "https://api.openai.com/v1/responses");
      assert.equal(request.body.model, models[index]);
      assert.equal(request.body.input, "generate json");
      assert.equal("messages" in request.body, false);
      assert.equal("temperature" in request.body, false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("callModel includes OpenAI API error details in failures", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    jsonResponse(
      {
        error: {
          message: "Invalid request payload",
        },
      },
      400
    )) as typeof fetch;

  try {
    await assert.rejects(
      callModel("generate json", {
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "test-openai-key",
      }),
      /OpenAI error: 400 - Invalid request payload/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("callModel uses the Anthropic Messages API consistently", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push({ url, body });

    return jsonResponse({
      content: [
        {
          type: "text",
          text: "{\"ok\":true}",
        },
      ],
    });
  }) as typeof fetch;

  try {
    const result = await callModel("generate json", {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      apiKey: "test-anthropic-key",
    });

    assert.equal(result, "{\"ok\":true}");
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://api.anthropic.com/v1/messages");
    assert.equal(requests[0]?.body.model, "claude-haiku-4-5-20251001");
    assert.equal(requests[0]?.body.max_tokens, 800);
    assert.equal(requests[0]?.body.temperature, 0.2);
    assert.equal(Array.isArray(requests[0]?.body.messages), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("callModel includes Anthropic API error details in failures", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    jsonResponse(
      {
        error: {
          message: "model not found",
        },
      },
      400
    )) as typeof fetch;

  try {
    await assert.rejects(
      callModel("generate json", {
        provider: "anthropic",
        model: "claude-invalid",
        apiKey: "test-anthropic-key",
      }),
      /Anthropic error: 400 - model not found/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("prepareRemediationPromptInput redacts sensitive notes and project metadata for external providers", () => {
  const previous = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AI_ALLOW_SENSITIVE_MODEL_DATA: process.env.AI_ALLOW_SENSITIVE_MODEL_DATA,
  };

  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-openai-key";
  delete process.env.AI_ALLOW_SENSITIVE_MODEL_DATA;

  try {
    const redacted = prepareRemediationPromptInput({
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
    AI_REMEDIATION_AGENT_PROVIDER: process.env.AI_REMEDIATION_AGENT_PROVIDER,
    AI_REMEDIATION_AGENT_MODEL: process.env.AI_REMEDIATION_AGENT_MODEL,
    AI_ALLOW_SENSITIVE_MODEL_DATA: process.env.AI_ALLOW_SENSITIVE_MODEL_DATA,
  };

  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-global";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.ANTHROPIC_MODEL = "claude-global";
  process.env.AI_SEARCH_ASSISTANT_PROVIDER = "heuristic";
  process.env.AI_SEARCH_ASSISTANT_MODEL = "ignored-search-model";
  process.env.AI_REMEDIATION_AGENT_PROVIDER = "openai";
  process.env.AI_REMEDIATION_AGENT_MODEL = "gpt-remediation";
  delete process.env.AI_ALLOW_SENSITIVE_MODEL_DATA;

  try {
    const summary = getServerAIConfigurationSummary();
    const search = summary.featureConfigurations.find((item) => item.feature === "search_assistant");
    const remediationAgent = summary.featureConfigurations.find((item) => item.feature === "remediation_agent");

    assert.equal(summary.provider, "openai");
    assert.equal(summary.model, "gpt-global");
    assert.equal(summary.redactionEnabledForExternalModels, true);
    assert.equal(summary.sensitiveDataAllowedToModels, false);
    assert.equal(search?.provider, "heuristic");
    assert.equal(search?.mode, "heuristic");
    assert.equal(search?.model, "");
    assert.equal(remediationAgent?.provider, "openai");
    assert.equal(remediationAgent?.model, "gpt-remediation");
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
