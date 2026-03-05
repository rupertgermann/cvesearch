"use client";

import { useState } from "react";

interface CopyLinkButtonProps {
  href: string;
  size?: "sm" | "md";
}

export default function CopyLinkButton({ href, size = "md" }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const sizeClasses = size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";

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
      className={`inline-flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white ${sizeClasses}`}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
