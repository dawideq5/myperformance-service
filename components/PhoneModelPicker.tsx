"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

interface PhoneOption {
  brand: string;
  model: string;
  slug: string;
  year: number | null;
}

/**
 * Picker modeli telefonów z autocomplete + fuzzy search po brand/model/aliases.
 * Backed przez /api/phones/search (debounce 200ms). Wybrana wartość = slug
 * (canonical). Display = "Brand Model" (np. "Apple iPhone 13 Pro Max").
 *
 * Walidacja: user MUSI wybrać z listy. Wolne wpisanie nie zatwierdza wartości.
 * Gdy nowy model nie jest w bazie → admin musi dodać przez Directus
 * (mp_phone_models) lub /admin/phones.
 */
export function PhoneModelPicker({
  value,
  onChange,
  placeholder = "Wyszukaj model telefonu…",
  required = false,
  disabled = false,
}: {
  value: string | null;
  onChange: (slug: string | null, label: string | null) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<PhoneOption[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Resolve label dla initial value (np. edycja istniejącej pozycji).
  useEffect(() => {
    if (!value) {
      setSelectedLabel(null);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/phones/search?q=${encodeURIComponent(value)}&limit=5`);
        if (!res.ok) return;
        const json = (await res.json()) as { phones: PhoneOption[] };
        const found = json.phones.find((p) => p.slug === value);
        if (found) setSelectedLabel(`${found.brand} ${found.model}`);
      } catch {
        /* noop */
      }
    })();
  }, [value]);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/phones/search?q=${encodeURIComponent(query)}&limit=20`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as { phones: PhoneOption[] };
        setOptions(json.phones);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, open]);

  // Click outside → close.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const select = (opt: PhoneOption) => {
    const label = `${opt.brand} ${opt.model}`;
    setSelectedLabel(label);
    onChange(opt.slug, label);
    setQuery("");
    setOpen(false);
  };

  const clear = () => {
    setSelectedLabel(null);
    onChange(null, null);
    setQuery("");
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
        <input
          type="text"
          value={open ? query : selectedLabel ?? ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (selectedLabel) {
              setSelectedLabel(null);
              onChange(null, null);
            }
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="w-full pl-9 pr-9 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--accent)]"
        />
        {(selectedLabel || query) && !disabled && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[var(--bg-card)]"
            aria-label="Wyczyść"
          >
            <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-2xl">
          {loading && (
            <div className="px-3 py-3 text-xs text-[var(--text-muted)] flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Szukam…
            </div>
          )}
          {!loading && options.length === 0 && (
            <div className="px-3 py-3 text-xs text-[var(--text-muted)]">
              Brak wyników. Skontaktuj się z administratorem aby dodać model do bazy.
            </div>
          )}
          {!loading &&
            options.map((opt) => (
              <button
                key={opt.slug}
                type="button"
                onClick={() => select(opt)}
                className="w-full text-left px-3 py-2 hover:bg-[var(--bg-surface)] flex items-center justify-between gap-3 border-b border-[var(--border-subtle)]/30 last:border-0"
              >
                <span className="text-sm text-[var(--text-main)]">
                  <span className="font-medium">{opt.brand}</span>{" "}
                  <span>{opt.model}</span>
                </span>
                {opt.year && (
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {opt.year}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
