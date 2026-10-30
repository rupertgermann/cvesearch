import { cookies } from "next/headers";
import ExposureQueuePageClient from "@/components/ExposureQueuePageClient";
import { getWorkspaceSession } from "@/lib/auth-session";
import { listMonitoredRepos } from "@/lib/monitored-repos-store";
import { listInventoryAssetsForUser } from "@/lib/workspace-store";
import SearchPage from "./search/page";

export const dynamic = "force-dynamic";

// Home is the exposure queue once the user has inventory or monitored repos; otherwise the CVE search.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  // Old "/?query=…" search links keep working.
  if (Object.keys(resolvedSearchParams).length === 0 && await hasExposureSources()) {
    return <ExposureQueuePageClient />;
  }

  return <SearchPage searchParams={Promise.resolve(resolvedSearchParams)} />;
}

async function hasExposureSources(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = getWorkspaceSession(new Request("https://example.test/", {
    headers: { cookie: cookieStore.toString() },
  }), { refresh: false });
  if (!session) return false;

  const [assets, repos] = await Promise.all([listInventoryAssetsForUser(session.userId), listMonitoredRepos(session.userId)]);
  return assets.length > 0 || repos.length > 0;
}
