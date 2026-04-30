"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui";
import {
  geocodeAddress,
  type NominatimResult,
} from "@/lib/services/locations-service";

/**
 * Adres autocomplete (Nominatim OSM). Debounce 400ms, dropdown z wynikami,
 * click outside zamyka. Wyciągnięte z LocationsClient.tsx — wcześniej
 * komponent inline `AddressAutocomplete`.
 */
export function LocationGeocoding({
  value,
  onAddressChange,
  onSelect,
}: {
  value: string;
  onAddressChange: (v: string) => void;
  onSelect: (r: NominatimResult) => void;
}) {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value || value.length < 4) {
      setResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await geocodeAddress(value);
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Click outside zamyka dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        label="Adres"
        value={value}
        onChange={(e) => onAddressChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Zacznij wpisywać ulicę / miasto…"
      />
      {loading && (
        <span className="absolute right-3 top-9 text-[10px] text-[var(--text-muted)]">
          szukanie…
        </span>
      )}
      {open && results.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full rounded-lg border bg-[var(--bg-card)] shadow-2xl max-h-64 overflow-auto animate-fade-in"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-[var(--bg-surface)] text-xs"
              >
                {r.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
