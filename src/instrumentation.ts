export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { readSchedulerConfig, runSchedulerTick } = await import("./lib/scheduler");
  const { enabled, intervalMs } = readSchedulerConfig();
  if (!enabled) return;

  const tick = () => runSchedulerTick().catch((error) => console.error("[scheduler] tick failed", error));
  setInterval(tick, intervalMs).unref();
  console.log(`[scheduler] running every ${Math.round(intervalMs / 1000)}s`);
}
