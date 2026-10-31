import { cookies } from "next/headers";
import AISettingsPageClient from "@/components/AISettingsPageClient";
import { getServerAIConfigurationSummary } from "@/lib/ai-service";
import { listInventoryAssetsForUser } from "@/lib/workspace-store";
import { getWorkspaceSession } from "@/lib/auth-session";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const session = getWorkspaceSession(new Request("https://example.test/settings", {
    headers: { cookie: cookieStore.toString() },
  }), { refresh: false });
  const summary = getServerAIConfigurationSummary();
  const inventoryAssets = session ? await listInventoryAssetsForUser(session.userId) : [];

  return <AISettingsPageClient summary={summary} inventoryAssets={inventoryAssets} />;
}
