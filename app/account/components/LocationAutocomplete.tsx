"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { Input } from "@/components/ui";
import type { GeocodingResult } from "@/app/api/geocoding/search/route";

interface LocationAutocompleteProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function LocationAutocomplete({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: LocationAutocompleteProps) {
  const listboxId = useId();
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressFetchRef = useRef(false);

  useEffect(() => {
    if (suppressFetchRef.current) {
      suppressFetchRef.current = false;
      return;
    }
    const q = value.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/geocoding/search?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal, credentials: "same-origin" },
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const json = (await res.json()) as { results?: GeocodingResult[] };
        setResults(json.results ?? []);
        setHighlighted(-1);
      } catch {
        /* aborted or failed silently */
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pick = useCallback(
    (r: GeocodingResult) => {
      suppressFetchRef.current = true;
      onChange(r.displayName);
      setOpen(false);
      setResults([]);
    },
    [onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      pick(results[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        label={label}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        leftIcon={<MapPin className="w-4 h-4" aria-hidden="true" />}
        rightSlot={
          loading ? (
            <Loader2
              className="w-4 h-4 mr-2 animate-spin text-[var(--text-muted)]"
              aria-hidden="true"
            />
          ) : undefined
        }
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg py-1"
        >
          {results.map((r, i) => (
            <li
              key={`${r.lat}-${r.lon}-${i}`}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`px-3 py-2 text-sm cursor-pointer flex items-start gap-2 ${
                i === highlighted
                  ? "bg-[var(--accent)]/10 text-[var(--text-main)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-main)]"
              }`}
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-60" aria-hidden="true" />
              <span className="flex-1 leading-snug">{r.displayName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
