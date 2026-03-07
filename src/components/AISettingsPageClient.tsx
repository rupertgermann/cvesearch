import Link from "next/link";
import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  Text,
} from "@radix-ui/themes";
import { ServerAIConfigurationSummary } from "@/lib/ai-service";
import { AIRunRecord } from "@/lib/types";
import { InventoryAssetRecord } from "@/lib/workspace-types";
import InventoryAssetsPanel from "@/components/InventoryAssetsPanel";
import WorkspaceDataPanel from "@/components/WorkspaceDataPanel";

export default function AISettingsPageClient({
  summary,
  recentRuns,
  inventoryAssets,
}: {
  summary: ServerAIConfigurationSummary;
  recentRuns: AIRunRecord[];
  inventoryAssets: InventoryAssetRecord[];
}) {
  const usageSummary = summarizeAIRunUsage(recentRuns);

  return (
    <div className="app-shell px-4 py-8 sm:px-6">
      <Flex justify="between" align={{ initial: "start", sm: "end" }} gap="4" wrap="wrap" className="mb-8">
        <div>
          <Heading size="8" className="text-white">AI Settings</Heading>
          <Text as="p" size="3" color="gray" className="mt-2 max-w-3xl">
            AI features now use server-side configuration so provider credentials never need to live in the browser.
          </Text>
        </div>
        <Button asChild variant="soft" color="gray" highContrast>
          <Link href="/">Back to Search</Link>
        </Button>
      </Flex>

      <div className="space-y-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <Grid columns={{ initial: "1", sm: "2" }} gap="4">
          <MetricCard label="Provider" value={summary.provider} />
          <MetricCard label="Mode" value={summary.mode === "configured" ? "Configured provider" : "Heuristic fallback"} />
          <MetricCard label="Model" value={summary.model || "Not required in heuristic mode"} className="sm:col-span-2" />
        </Grid>

        <Callout.Root color="amber" variant="soft">
          <Callout.Text>
            Configure AI providers with environment variables such as `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_MODEL`. You can override individual flows with `AI_SEARCH_ASSISTANT_PROVIDER`, `AI_SEARCH_ASSISTANT_MODEL`, `AI_CVE_INSIGHT_PROVIDER`, `AI_CVE_INSIGHT_MODEL`, `AI_TRIAGE_AGENT_PROVIDER`, `AI_TRIAGE_AGENT_MODEL`, `AI_REMEDIATION_AGENT_PROVIDER`, `AI_REMEDIATION_AGENT_MODEL`, `AI_WATCHLIST_ANALYST_PROVIDER`, `AI_WATCHLIST_ANALYST_MODEL`, `AI_PROJECT_SUMMARY_PROVIDER`, `AI_PROJECT_SUMMARY_MODEL`, `AI_ALERT_INVESTIGATION_PROVIDER`, `AI_ALERT_INVESTIGATION_MODEL`, `AI_EXPOSURE_AGENT_PROVIDER`, `AI_EXPOSURE_AGENT_MODEL`, and `AI_DAILY_DIGEST_PROVIDER`, `AI_DAILY_DIGEST_MODEL`. No provider API key is persisted in browser storage.
          </Callout.Text>
        </Callout.Root>

        <Callout.Root color={summary.configured ? "cyan" : "gray"} variant="soft">
          <Callout.Text>
            {summary.configured
              ? `Server-side AI is active using ${summary.provider}${summary.model ? ` (${summary.model})` : ""}.`
              : "No server-side AI provider key is configured, so the app is using deterministic heuristic fallbacks."}
          </Callout.Text>
        </Callout.Root>

        <Callout.Root color={summary.redactionEnabledForExternalModels ? "amber" : "green"} variant="soft">
          <Callout.Text>
            {summary.redactionEnabledForExternalModels
              ? "Sensitive triage notes, owners, and project metadata are redacted before prompts are sent to third-party model providers. Set `AI_ALLOW_SENSITIVE_MODEL_DATA=true` only if you explicitly want to disable that safeguard."
              : "Sensitive prompt redaction is disabled for external model calls because `AI_ALLOW_SENSITIVE_MODEL_DATA=true` is set."}
          </Callout.Text>
        </Callout.Root>

        <Flex justify="between" align="center" wrap="wrap" gap="3">
          <Text size="2" color="gray">
            {summary.availableProviders.length > 0
              ? `Available providers: ${summary.availableProviders.join(", ")}`
              : "No model provider credentials detected on the server."}
          </Text>
          <Flex gap="2" wrap="wrap">
            {summary.availableProviders.map((provider) => (
              <Badge key={provider} color="cyan" variant="soft">{provider}</Badge>
            ))}
          </Flex>
        </Flex>

        <Card size="3" className="border border-white/[0.06] bg-white/[0.03]">
          <Heading size="4" className="text-white">Per-Feature Configuration</Heading>
          <Text as="p" size="2" color="gray" className="mt-1">
            Each AI flow can inherit the global server configuration or override it with feature-specific provider and model settings.
          </Text>

          <Grid columns={{ initial: "1", md: "3" }} gap="3" className="mt-4">
            {summary.featureConfigurations.map((featureConfig) => (
              <Card key={featureConfig.feature} size="2" className="border border-white/[0.06] bg-black/20">
                <Flex justify="between" align="center" gap="2">
                  <Heading size="3" className="text-white">{featureConfig.feature}</Heading>
                  <Badge color={featureConfig.mode === "configured" ? "cyan" : "gray"} variant="soft">
                    {featureConfig.mode === "configured" ? "Configured" : "Heuristic"}
                  </Badge>
                </Flex>
                <div className="mt-3 space-y-2">
                  <Text as="p" size="2" className="text-gray-300"><span className="text-gray-500">Provider:</span> {featureConfig.provider}</Text>
                  <Text as="p" size="2" className="text-gray-300"><span className="text-gray-500">Model:</span> {featureConfig.model || "Not required in heuristic mode"}</Text>
                </div>
              </Card>
            ))}
          </Grid>
        </Card>

        <Grid columns={{ initial: "1", xl: "2" }} gap="4">
          <Card size="3" className="border border-white/[0.06] bg-white/[0.03]">
            <Heading size="4" className="text-white">Prompt Versions</Heading>
            <Text as="p" size="2" color="gray" className="mt-1">
              Prompt changes are versioned explicitly so behavior updates are visible and reversible.
            </Text>
            <div className="mt-4 space-y-3">
              {summary.promptTemplates.map((template) => (
                <Card key={template.feature} size="2" className="border border-white/[0.06] bg-black/20">
                  <Flex justify="between" align="center" gap="3" wrap="wrap">
                    <div>
                      <Heading size="3" className="text-white">{template.feature}</Heading>
                      <Text as="p" size="2" color="gray" className="mt-1">{template.description}</Text>
                    </div>
                    <Badge color="cyan" variant="soft">{template.version}</Badge>
                  </Flex>
                </Card>
              ))}
            </div>
          </Card>

          <Card size="3" className="border border-white/[0.06] bg-white/[0.03]">
            <Heading size="4" className="text-white">Tool Registry</Heading>
            <Text as="p" size="2" color="gray" className="mt-1">
              Shared tools define the read and write capabilities available to current and future agent workflows.
            </Text>
            <div className="mt-4 space-y-3">
              {summary.toolRegistry.map((tool) => (
                <Card key={tool.name} size="2" className="border border-white/[0.06] bg-black/20">
                  <Flex justify="between" align="start" gap="3" wrap="wrap">
                    <div>
                      <Heading size="3" className="text-white">{tool.name}</Heading>
                      <Text as="p" size="2" color="gray" className="mt-1">{tool.description}</Text>
                      <Text as="p" size="1" color="gray" className="mt-2">
                        Features: {tool.features.join(", ")}
                      </Text>
                    </div>
                    <Badge color={tool.access === "write" ? "amber" : "cyan"} variant="soft">{tool.access}</Badge>
                  </Flex>
                </Card>
              ))}
            </div>
          </Card>
        </Grid>

        <InventoryAssetsPanel initialAssets={inventoryAssets} />

        <WorkspaceDataPanel />

        <Card size="3" className="border border-white/[0.06] bg-white/[0.03]">
          <Heading size="4" className="text-white">Recent AI Runs</Heading>
          <Text as="p" size="2" color="gray" className="mt-1">
            Read-only history of prompts, outcomes, latency, estimated tokens, and estimated provider cost.
          </Text>

          <Grid columns={{ initial: "1", md: "4" }} gap="3" className="mt-4">
            <MetricCard label="Runs" value={String(usageSummary.runCount)} />
            <MetricCard label="Avg Latency" value={`${usageSummary.averageDurationMs}ms`} />
            <MetricCard label="Est. Tokens" value={usageSummary.totalTokens.toLocaleString("en-US")} />
            <MetricCard label="Est. Cost" value={`$${usageSummary.totalCostUsd.toFixed(4)}`} />
          </Grid>

          {recentRuns.length > 0 ? (
            <div className="mt-4 space-y-3">
              {recentRuns.map((run) => (
                <Card key={run.id} size="2" className="border border-white/[0.06] bg-black/20">
                  <Flex gap="2" wrap="wrap" align="center">
                    <Badge color="cyan" variant="soft">{run.feature}</Badge>
                    <Badge color={run.status === "error" ? "red" : run.status === "fallback" ? "amber" : "green"} variant="soft">{run.status}</Badge>
                    <Badge color="gray" variant="soft">{run.provider}{run.model ? ` • ${run.model}` : ""}</Badge>
                    <Text size="1" color="gray">{new Date(run.createdAt).toLocaleString("en-US")}</Text>
                    <Text size="1" color="gray">{run.durationMs}ms</Text>
                    <Text size="1" color="gray">~{((run.promptTokensEstimate ?? 0) + (run.outputTokensEstimate ?? 0)).toLocaleString("en-US")} tokens</Text>
                    <Text size="1" color="gray">${(run.estimatedCostUsd ?? 0).toFixed(4)}</Text>
                  </Flex>

                  <div className="mt-3 grid gap-3">
                    <RunBlock title="Prompt" value={run.prompt} />
                    <RunBlock title="Output" value={run.output} />

                    {run.toolCalls.length > 0 ? (
                      <div>
                        <Text size="1" weight="bold" className="uppercase tracking-wider text-gray-500">Tool Calls</Text>
                        <div className="mt-2 space-y-2">
                          {run.toolCalls.map((call) => (
                            <div key={`${run.id}-${call.tool}`} className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-gray-300">
                              <span className="font-medium text-white">{call.tool}</span>
                              <span className="text-gray-400"> — {call.summary}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {run.error ? (
                      <Callout.Root color="amber" variant="soft">
                        <Callout.Text>{run.error}</Callout.Text>
                      </Callout.Root>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Text as="p" size="2" color="gray" className="mt-4">No AI runs have been recorded yet.</Text>
          )}
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <Card size="2" className={`border border-white/[0.06] bg-white/[0.03] ${className}`.trim()}>
      <Text as="p" size="1" weight="bold" className="uppercase tracking-wider text-gray-500">{label}</Text>
      <Text as="p" size="3" className="mt-2 text-white">{value}</Text>
    </Card>
  );
}

function RunBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <Text size="1" weight="bold" className="uppercase tracking-wider text-gray-500">{title}</Text>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-gray-300">{value}</pre>
    </div>
  );
}

function summarizeAIRunUsage(runs: AIRunRecord[]) {
  const totalDurationMs = runs.reduce((sum, run) => sum + run.durationMs, 0);
  const totalTokens = runs.reduce((sum, run) => sum + (run.promptTokensEstimate ?? 0) + (run.outputTokensEstimate ?? 0), 0);
  const totalCostUsd = runs.reduce((sum, run) => sum + (run.estimatedCostUsd ?? 0), 0);

  return {
    runCount: runs.length,
    averageDurationMs: runs.length > 0 ? Math.round(totalDurationMs / runs.length) : 0,
    totalTokens,
    totalCostUsd,
  };
}
