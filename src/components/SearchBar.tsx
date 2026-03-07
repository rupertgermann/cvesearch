"use client";

import { useState, useCallback } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  initialQuery?: string;
  loading?: boolean;
}

export default function SearchBar({ onSearch, initialQuery = "", loading }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSearch(query.trim());
    },
    [query, onSearch]
  );

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className={`relative rounded-xl transition-all duration-300 ${
        focused
          ? "shadow-[0_0_0_1px_rgba(34,211,238,0.3),0_0_40px_-8px_rgba(34,211,238,0.15),0_4px_24px_-4px_rgba(0,0,0,0.3)]"
          : "shadow-[0_2px_12px_-4px_rgba(0,0,0,0.3)]"
      }`}>
        {/* Gradient border effect */}
        <div className={`absolute -inset-px rounded-xl bg-gradient-to-r transition-opacity duration-300 ${
          focused
            ? "from-cyan-500/30 via-cyan-400/10 to-cyan-500/30 opacity-100"
            : "from-white/[0.06] to-white/[0.06] opacity-100"
        }`} />

        <div className="relative rounded-xl bg-[#0a0a14]">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
            {loading ? (
              <svg className="h-5 w-5 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg
                className={`h-5 w-5 transition-colors duration-200 ${focused ? "text-cyan-400" : "text-white/25"}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search by CVE ID, keyword, or describe what you're looking for..."
            className="h-13 w-full rounded-xl bg-transparent pl-12 pr-28 text-[15px] text-white placeholder-white/20 outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-primary absolute inset-y-1.5 right-1.5 flex items-center gap-1.5 rounded-lg px-5 text-sm disabled:opacity-40"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            Search
          </button>
        </div>
      </div>
    </form>
  );
}
