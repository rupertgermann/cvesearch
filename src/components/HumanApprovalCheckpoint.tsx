import { ApprovalCheckpoint } from "@/lib/approval-checkpoints";

export default function HumanApprovalCheckpoint<TState>({
  checkpoint,
  onApprove,
  onCancel,
}: {
  checkpoint: ApprovalCheckpoint<TState>;
  onApprove: (checkpoint: ApprovalCheckpoint<TState>) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] to-transparent p-4 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-200">Human Approval Checkpoint</h3>
          <p className="mt-1 text-sm text-white/50">{checkpoint.title}</p>
          <p className="mt-1 text-[11px] text-white/20">Source: {checkpoint.source}</p>
        </div>
        <span className="badge badge-xs border-amber-500/20 bg-amber-500/8 text-amber-200">
          <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
          Review required
        </span>
      </div>

      <div className="mt-4 glass rounded-lg p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Summary</p>
        <p className="mt-2 text-sm text-white/70">{checkpoint.summary}</p>
      </div>

      <div className="mt-4 space-y-2">
        {checkpoint.changes.map((change) => (
          <div key={change.field} className="glass rounded-lg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{change.field}</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/20">Current</p>
                <p className="mt-1 text-sm text-white/50">{change.currentValue}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/20">Proposed</p>
                <p className="mt-1 text-sm text-white">{change.proposedValue}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApprove(checkpoint)}
          className="rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-sm font-semibold text-black shadow-[0_2px_12px_-2px_rgba(245,158,11,0.3)] transition-all hover:shadow-[0_4px_20px_-2px_rgba(245,158,11,0.4)] hover:-translate-y-px"
        >
          Approve And Apply
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
