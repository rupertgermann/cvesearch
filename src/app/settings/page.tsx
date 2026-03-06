import AISettingsPageClient from "@/components/AISettingsPageClient";
import { getRecentAIRuns, getServerAIConfigurationSummary } from "@/lib/ai-service";

export default async function SettingsPage() {
  const summary = getServerAIConfigurationSummary();
  const recentRuns = await getRecentAIRuns(12);

  return <AISettingsPageClient summary={summary} recentRuns={recentRuns} />;
}
