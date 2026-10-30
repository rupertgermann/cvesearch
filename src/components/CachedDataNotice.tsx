export default function CachedDataNotice({ storedAt }: { storedAt?: string }) {
  return (
    <div role="status" className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <span className="font-medium">Cached data:</span> the upstream vulnerability API is unavailable, so this is served from the local store
      {/* UTC ISO text renders identically on server and client. */}
      {storedAt ? ` (stored ${storedAt.replace("T", " ").slice(0, 16)} UTC)` : ""} and may be stale.
    </div>
  );
}
