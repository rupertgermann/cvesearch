"use client";

interface PaginationProps {
  page: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

export default function Pagination({ page, hasMore, onPageChange, loading }: PaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1 || loading}
        className="btn-ghost flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-20"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Previous
      </button>

      <div className="flex items-center gap-1">
        <span className="rounded-lg bg-white/[0.06] px-3.5 py-1.5 font-mono text-sm font-medium text-white/70">
          {page}
        </span>
      </div>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={!hasMore || loading}
        className="btn-ghost flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-20"
      >
        Next
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}
