"use client";

import { Search } from "lucide-react";
import { Button, Card, FieldWrapper, Input } from "@/components/ui";
import type { AreaSummary } from "@/app/account/account-service";

/**
 * Pasek wyszukiwania + filter dropdown po roli (z areas list). Submit
 * formularza wyzwala parent search (`onSubmit`); dropdown role'i jest
 * controlled — zmiana od razu resetuje paginację (`onRoleChange`).
 */
export function UsersFilters({
  searchInput,
  onSearchInputChange,
  roleFilter,
  onRoleChange,
  areas,
  onSubmit,
  onReset,
  hasActiveFilters,
}: {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  roleFilter: string;
  onRoleChange: (r: string) => void;
  areas: AreaSummary[];
  onSubmit: (e: React.FormEvent) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}) {
  return (
    <Card padding="md" className="mb-4">
      <form onSubmit={onSubmit} className="flex flex-wrap gap-2 items-end">
        <FieldWrapper id="user-search" label="Szukaj" className="flex-1 min-w-[220px]">
          <Input
            id="user-search"
            placeholder="Email, imię, nazwisko, login…"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            leftIcon={<Search className="w-4 h-4" aria-hidden="true" />}
          />
        </FieldWrapper>
        <FieldWrapper id="role-filter" label="Filtr po roli" className="min-w-[220px]">
          <select
            id="role-filter"
            value={roleFilter}
            onChange={(e) => onRoleChange(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm text-[var(--text-main)]"
          >
            <option value="">— wszystkie role —</option>
            {areas.map((a) => (
              <optgroup key={a.id} label={a.label}>
                {a.roles.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.label || r.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </FieldWrapper>
        <Button type="submit" variant="secondary">
          Szukaj
        </Button>
        {hasActiveFilters && (
          <Button type="button" variant="ghost" onClick={onReset}>
            Wyczyść
          </Button>
        )}
      </form>
    </Card>
  );
}
