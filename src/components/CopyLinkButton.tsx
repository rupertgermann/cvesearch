"use client";

import { useState } from "react";

interface CopyLinkButtonProps {
  href: string;
  size?: "sm" | "md";
}

export default function CopyLinkButton({ href, size = "md" }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const sizeClasses = size === "sm" ? "h-7 px-2 text-[11px]" : "h-8 px-2.5 text-xs";

  return (
    <button
      type="button"
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const absoluteHref = typeof window === "undefined" ? href : new URL(href, window.location.origin).toString();
        await navigator.clipboard.writeText(absoluteHref);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className={`inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] font-medium transition-all duration-200 hover:border-white/[0.12] ${sizeClasses} ${
        copied ? "text-cyan-400" : "text-white/25 hover:text-white/50"
      }`}
    >
      {copied ? (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.868-4.242a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
        </svg>
      )}
      {copied ? "Copied" : "Link"}
    </button>
  );
}
