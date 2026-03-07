"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { getVendorProducts, getVendors } from "@/lib/api";
import { SearchSeverityFilter, SearchSortOption } from "@/lib/types";

interface FiltersProps {
  onApply: (filters: {
    vendor: string;
    product: string;
    cwe: string;
    since: string;
    minSeverity: SearchSeverityFilter;
    sort: SearchSortOption;
  }) => void;
  initialFilters?: {
    vendor: string;
    product: string;
    cwe: string;
    since: string;
    minSeverity: SearchSeverityFilter;
    sort: SearchSortOption;
  };
}

const QUICK_DATES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
];

export default function Filters({ onApply, initialFilters }: FiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [vendor, setVendor] = useState(initialFilters?.vendor || "");
  const [product, setProduct] = useState(initialFilters?.product || "");
  const [cwe, setCwe] = useState(initialFilters?.cwe || "");
  const [since, setSince] = useState(initialFilters?.since || "");
  const [minSeverity, setMinSeverity] = useState<SearchSeverityFilter>(initialFilters?.minSeverity || "ANY");
  const [sort, setSort] = useState<SearchSortOption>(initialFilters?.sort || "published_desc");
  const [vendors, setVendors] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const deferredVendor = useDeferredValue(vendor.trim());

  useEffect(() => {
    let cancelled = false;

    async function loadVendors() {
      if (!isOpen || vendors.length > 0) return;

      setLoadingVendors(true);
      try {
        const result = await getVendors();
        if (!cancelled) {
          setVendors(result);
        }
      } finally {
        if (!cancelled) {
          setLoadingVendors(false);
        }
      }
    }

    loadVendors();
    return () => {
      cancelled = true;
    };
  }, [isOpen, vendors.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      if (!isOpen || !deferredVendor) {
        setProducts([]);
        return;
      }

      setLoadingProducts(true);
      try {
        const result = await getVendorProducts(deferredVendor);
        if (!cancelled) {
          setProducts(result);
        }
      } catch {
        if (!cancelled) {
          setProducts([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingProducts(false);
        }
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [deferredVendor, isOpen]);

  const vendorSuggestions = useMemo(() => {
    if (!vendor.trim()) return vendors.slice(0, 20);
    const normalized = vendor.trim().toLowerCase();
    return vendors.filter((item) => item.toLowerCase().includes(normalized)).slice(0, 20);
  }, [vendor, vendors]);

  const productSuggestions = useMemo(() => {
    if (!product.trim()) return products.slice(0, 20);
    const normalized = product.trim().toLowerCase();
    return products.filter((item) => item.toLowerCase().includes(normalized)).slice(0, 20);
  }, [product, products]);

  const handleApply = () => {
    onApply({ vendor, product, cwe, since, minSeverity, sort });
  };

  const handleClear = () => {
    setVendor("");
    setProduct("");
    setCwe("");
    setSince("");
    setMinSeverity("ANY");
    setSort("published_desc");
    onApply({ vendor: "", product: "", cwe: "", since: "", minSeverity: "ANY", sort: "published_desc" });
  };

  const setQuickDate = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const formatted = date.toISOString().split("T")[0];
    setSince(formatted);
  };

  const hasFilters = vendor || product || cwe || since || minSeverity !== "ANY" || sort !== "published_desc";

  return (
    <div className="w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
          hasFilters
            ? "border-cyan-500/30 bg-cyan-500/8 text-cyan-400 shadow-[0_0_12px_-4px_rgba(34,211,238,0.2)]"
            : "border-white/[0.08] bg-white/[0.03] text-white/40 hover:bg-white/[0.05] hover:text-white/60"
        }`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
          />
        </svg>
        Filters
        {hasFilters && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-black">
            {[vendor, product, cwe, since, minSeverity !== "ANY" ? minSeverity : "", sort !== "published_desc" ? sort : ""].filter(Boolean).length}
          </span>
        )}
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="glass mt-3 rounded-xl p-5 animate-slide-down">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/30">Vendor</label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => {
                  setVendor(e.target.value);
                  setProduct("");
                }}
                list="vendor-suggestions"
                placeholder="e.g. microsoft"
                className="input-base w-full px-3 py-2 text-sm"
              />
              <datalist id="vendor-suggestions">
                {vendorSuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <p className="mt-1 text-[11px] text-white/20">
                {loadingVendors ? "Loading vendors..." : vendorSuggestions.length ? `${vendorSuggestions.length} suggestions` : "Type to browse"}
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/30">Product</label>
              <input
                type="text"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                list="product-suggestions"
                placeholder="e.g. windows"
                disabled={!vendor.trim()}
                className="input-base w-full px-3 py-2 text-sm"
              />
              <datalist id="product-suggestions">
                {productSuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <p className="mt-1 text-[11px] text-white/20">
                {!vendor.trim()
                  ? "Choose a vendor first"
                  : loadingProducts
                    ? "Loading products..."
                    : productSuggestions.length
                      ? `${productSuggestions.length} suggestions`
                      : "No suggestions"}
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/30">CWE</label>
              <input
                type="text"
                value={cwe}
                onChange={(e) => setCwe(e.target.value)}
                placeholder="e.g. CWE-79"
                className="input-base w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/30">Since</label>
              <input
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                className="input-base w-full px-3 py-2 text-sm [color-scheme:dark]"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {QUICK_DATES.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setQuickDate(d.days)}
                    className="rounded-md bg-white/[0.04] px-2 py-0.5 text-xs text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/60"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/30">Min Severity</label>
              <select
                value={minSeverity}
                onChange={(event) => setMinSeverity(event.target.value as SearchSeverityFilter)}
                className="input-base w-full px-3 py-2 text-sm"
              >
                <option value="ANY">Any</option>
                <option value="LOW">Low+</option>
                <option value="MEDIUM">Medium+</option>
                <option value="HIGH">High+</option>
                <option value="CRITICAL">Critical only</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/30">Sort</label>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SearchSortOption)}
                className="input-base w-full px-3 py-2 text-sm"
              >
                <option value="risk_desc">Highest risk</option>
                <option value="published_desc">Newest first</option>
                <option value="published_asc">Oldest first</option>
                <option value="cvss_desc">Highest CVSS</option>
                <option value="cvss_asc">Lowest CVSS</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleApply} className="btn-primary px-4 py-2 text-sm">
              Apply Filters
            </button>
            {hasFilters && (
              <button onClick={handleClear} className="btn-ghost px-4 py-2 text-sm">
                Clear All
              </button>
            )}
          </div>
          {vendor && !product && (
            <p className="mt-3 text-xs text-amber-300/60">
              Vendor-only search is not enabled yet. Pick a product to run a vendor-scoped search.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
