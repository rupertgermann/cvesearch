import { cookies } from "next/headers";
import AISettingsPageClient from "@/components/AISettingsPageClient";
import { getRecentAIRuns, getServerAIConfigurationSummary } from "@/lib/ai-service";
import { listInventoryAssetsForUser } from "@/lib/workspace-store";
import { getOrCreateWorkspaceSession } from "@/lib/auth-session";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const session = getOrCreateWorkspaceSession(new Request("https://example.test/settings", {
    headers: { cookie: cookieStore.toString() },
  }));
  const summary = getServerAIConfigurationSummary();
  const [recentRuns, inventoryAssets] = await Promise.all([
    getRecentAIRuns(12),
    listInventoryAssetsForUser(session.userId),
  ]);

  return <AISettingsPageClient summary={summary} recentRuns={recentRuns} inventoryAssets={inventoryAssets} />;
}
