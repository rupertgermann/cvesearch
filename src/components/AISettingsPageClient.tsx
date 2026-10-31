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
import { InventoryAssetRecord } from "@/lib/workspace-types";
import InventoryAssetsPanel from "@/components/InventoryAssetsPanel";
import WorkspaceDataPanel from "@/components/WorkspaceDataPanel";

export default function AISettingsPageClient({
  summary,
  inventoryAssets,
}: {
  summary: ServerAIConfigurationSummary;
  inventoryAssets: InventoryAssetRecord[];
}) {
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
                  <Text as="p" size="2" className="text-white/50"><span className="text-white/25">Provider:</span> {featureConfig.provider}</Text>
                  <Text as="p" size="2" className="text-white/50"><span className="text-white/25">Model:</span> {featureConfig.model || "Not required in heuristic mode"}</Text>
                </div>
              </Card>
            ))}
          </Grid>
        </Card>

        <InventoryAssetsPanel initialAssets={inventoryAssets} />

        <WorkspaceDataPanel />
      </div>
    </div>
  );
}

function MetricCard({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <Card size="2" className={`border border-white/[0.06] bg-white/[0.03] ${className}`.trim()}>
      <Text as="p" size="1" weight="bold" className="uppercase tracking-wider text-white/25">{label}</Text>
      <Text as="p" size="3" className="mt-2 text-white">{value}</Text>
    </Card>
  );
}
