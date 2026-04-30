// Pure helpers extracted from app/admin/email/EmailClient.tsx during faza-3.
// Stateless functions only — no React, no I/O, no DOM. Intent: easy to unit-test.

import type {
  CatalogVariable,
  TemplateRow,
} from "@/components/admin/email/types";

/**
 * Filter a list of templates by free-text search and (optional) category.
 * Replicates the inline filter logic that previously lived inside `TemplatesPanel`.
 */
export function filterTemplates(
  templates: TemplateRow[],
  search: string,
  categoryFilter: string | null,
): TemplateRow[] {
  return templates.filter((t) => {
    if (categoryFilter && t.category !== categoryFilter) return false;
    if (search) {
      const f = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(f) ||
        t.appLabel.toLowerCase().includes(f) ||
        t.actionKey.toLowerCase().includes(f)
      );
    }
    return true;
  });
}

/** Group already-filtered templates by their `category` field. */
export function groupTemplatesByCategory(
  templates: TemplateRow[],
): Record<string, TemplateRow[]> {
  const out: Record<string, TemplateRow[]> = {};
  for (const t of templates) {
    (out[t.category] ??= []).push(t);
  }
  return out;
}

/**
 * Filter the variable catalogue used by the slash picker. Compares against key,
 * label and description (case-insensitive substring match).
 */
export function filterVariables(
  variables: CatalogVariable[],
  query: string,
): CatalogVariable[] {
  const q = query.toLowerCase();
  if (!q) return variables;
  return variables.filter(
    (v) =>
      v.key.toLowerCase().includes(q) ||
      v.label.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q),
  );
}

/** Group variables by their `group` field for the picker UI. */
export function groupVariables(
  variables: CatalogVariable[],
): Record<string, CatalogVariable[]> {
  const out: Record<string, CatalogVariable[]> = {};
  for (const v of variables) {
    (out[v.group] ??= []).push(v);
  }
  return out;
}

/** Heuristically classify a variable so we can pick the right input type. */
export function inferVariableType(
  v: CatalogVariable,
): "url" | "email" | "text" {
  const key = v.key.toLowerCase();
  if (key.includes("link") || key.includes("url")) return "url";
  if (key.includes("email")) return "email";
  return "text";
}

/** Render a placeholder string for the manual-value input next to a variable. */
export function variableManualPlaceholder(v: CatalogVariable): string {
  const t = inferVariableType(v);
  if (t === "url") return "https://...";
  if (t === "email") return "ktos@example.com";
  return v.example;
}
