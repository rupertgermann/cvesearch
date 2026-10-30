export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { readSchedulerConfig, startScheduler } = await import("./lib/scheduler");
  const { enabled, intervalMs } = readSchedulerConfig();
  if (enabled && startScheduler(intervalMs)) {
    console.log(`[scheduler] running every ${Math.round(intervalMs / 1000)}s`);
  }
}
