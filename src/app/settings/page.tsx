import AISettingsPageClient from "@/components/AISettingsPageClient";
import { getServerAIConfigurationSummary } from "@/lib/ai-service";

export default function SettingsPage() {
  const summary = getServerAIConfigurationSummary();

  return <AISettingsPageClient summary={summary} />;
}
