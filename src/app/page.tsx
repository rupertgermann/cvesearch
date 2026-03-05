import HomePageClient from "@/components/HomePageClient";
import { parseSearchState } from "@/lib/search";
import { getHomePageResults } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const state = parseSearchState(resolvedSearchParams);
  const { cves, error, totalHint } = await getHomePageResults(state);

  return (
    <HomePageClient
      initialState={state}
      cves={cves}
      error={error}
      totalHint={totalHint}
    />
  );
}
