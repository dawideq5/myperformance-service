"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, Loader2, Search } from "lucide-react";

import { Alert, Badge, Card } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  filterTemplates,
  groupTemplatesByCategory,
} from "@/lib/services/email-service";

import { TemplateEditor } from "./TemplateEditor";
import { TemplateListItem } from "./parts/TemplateListItem";
import { CATEGORY_LABELS, type TemplateRow } from "./types";

export function TemplatesPanel() {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ templates: TemplateRow[] }>(
        "/api/admin/email/templates",
      );
      setTemplates(r.templates);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (templates ? filterTemplates(templates, filter, categoryFilter) : []),
    [templates, filter, categoryFilter],
  );

  const grouped = useMemo(() => groupTemplatesByCategory(filtered), [filtered]);

  if (selected && templates) {
    const t = templates.find((x) => x.actionKey === selected);
    if (t) {
      return (
        <TemplateEditor
          template={t}
          onClose={() => {
            setSelected(null);
            void load();
          }}
        />
      );
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            Każdy mail wysyłany przez stack ma swój wpis. Kliknij dowolny żeby
            edytować treść lub wyłączyć wysyłkę. Badges po prawej stronie:
            <span className="ml-1">
              <Badge tone="success">edytowalne</Badge> — pełna edycja w naszym
              panelu,
            </span>
            <span className="ml-1">
              <Badge tone="warning">KC localization</Badge> — edytuj subject +
              treść; render robi Keycloak,
            </span>
            <span className="ml-1">
              <Badge tone="neutral">w aplikacji</Badge> — edycja w dedykowanym
              UI aplikacji,
            </span>
            <span className="ml-1">
              <Badge tone="danger">brak edycji</Badge> — hardcoded w kodzie.
            </span>
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card padding="md">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Szukaj akcji…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm"
            />
          </div>
          <select
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
            value={categoryFilter ?? ""}
            onChange={(e) => setCategoryFilter(e.target.value || null)}
          >
            <option value="">Wszystkie kategorie</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {!templates && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie szablonów…
        </div>
      )}

      {Object.entries(grouped).map(([cat, list]) => (
        <Card key={cat} padding="md">
          <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3">
            {CATEGORY_LABELS[cat] ?? cat}{" "}
            <span className="text-[var(--text-muted)] font-normal">
              ({list.length})
            </span>
          </h3>
          <div className="space-y-1.5">
            {list.map((t) => (
              <TemplateListItem
                key={t.actionKey}
                template={t}
                onClick={() => setSelected(t.actionKey)}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
