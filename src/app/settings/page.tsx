import { cookies } from "next/headers";
import AISettingsPageClient from "@/components/AISettingsPageClient";
import { getRecentAIRuns, getServerAIConfigurationSummary } from "@/lib/ai-service";
import { listInventoryAssetsForUser } from "@/lib/workspace-store";
import { getWorkspaceSession } from "@/lib/auth-session";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const session = getWorkspaceSession(new Request("https://example.test/settings", {
    headers: { cookie: cookieStore.toString() },
  }), { refresh: false });
  const summary = getServerAIConfigurationSummary();
  const [recentRuns, inventoryAssets] = await Promise.all([
    session ? getRecentAIRuns(session.userId, 12) : Promise.resolve([]),
    session ? listInventoryAssetsForUser(session.userId) : Promise.resolve([]),
  ]);

  return <AISettingsPageClient summary={summary} recentRuns={recentRuns} inventoryAssets={inventoryAssets} />;
}
