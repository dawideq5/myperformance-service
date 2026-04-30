"use client";

import {
  PHONE_PREFIXES,
  splitPhone,
} from "@/lib/services/locations-service";

/** Telefon z country code dropdown. */
export function PhoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { prefix, rest } = splitPhone(value);

  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
        Telefon
      </label>
      <div className="flex gap-2">
        <select
          value={prefix}
          onChange={(e) => {
            const newPrefix = e.target.value;
            onChange(rest ? `${newPrefix} ${rest}` : newPrefix);
          }}
          className="rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-2 py-2 text-sm font-mono w-24"
        >
          {PHONE_PREFIXES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label} {p.code}
            </option>
          ))}
        </select>
        <input
          type="tel"
          value={rest}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9 -]/g, "");
            onChange(v ? `${prefix} ${v}` : prefix);
          }}
          placeholder="500 100 200"
          className="flex-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
