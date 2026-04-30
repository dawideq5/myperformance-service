"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Info, Save } from "lucide-react";

import { Alert, Button, Card, Input, Textarea } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

import type { LayoutFull } from "./types";

export function LayoutsPanel() {
  const [layouts, setLayouts] = useState<LayoutFull[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ layouts: LayoutFull[] }>(
        "/api/admin/email/layouts",
      );
      setLayouts(r.layouts);
      if (!selected && r.layouts[0]) setSelected(r.layouts[0].id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = layouts.find((l) => l.id === selected);

  const [draftHtml, setDraftHtml] = useState("");
  const [draftName, setDraftName] = useState("");
  useEffect(() => {
    if (current) {
      setDraftHtml(current.html);
      setDraftName(current.name);
    }
  }, [current]);

  async function save() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<
        { layout: LayoutFull },
        {
          slug: string;
          name: string;
          html: string;
          isDefault: boolean;
          description: string | null;
        }
      >("/api/admin/email/layouts", {
        slug: current.slug,
        name: draftName,
        html: draftHtml,
        isDefault: current.isDefault,
        description: current.description,
      });
      setNotice("Layout zapisany.");
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            Layout to globalny szkielet HTML — header MyPerformance, slot{" "}
            <code>{"{{content}}"}</code> dla treści, footer. Każdy szablon
            renderowany jest wewnątrz wybranego layoutu. Możesz edytować HTML
            bezpośrednio (TIP: testuj na małych zmianach — zły HTML łamie
            wszystkie maile).
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card padding="md">
        <div className="flex gap-2 flex-wrap">
          {layouts.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setSelected(l.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border ${
                selected === l.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--border-subtle)]"
              }`}
            >
              {l.name}
              {l.isDefault && <span className="ml-1 opacity-60">★</span>}
            </button>
          ))}
        </div>
      </Card>

      {current && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card padding="md">
            <Input
              label="Nazwa layoutu"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
            <label className="text-xs text-[var(--text-muted)] block mt-3 mb-1">
              HTML (z slotem <code>{"{{content}}"}</code> dla treści)
            </label>
            <Textarea
              rows={28}
              value={draftHtml}
              onChange={(e) => setDraftHtml(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="mt-3 flex gap-2">
              <Button
                onClick={save}
                loading={busy}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Zapisz
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (current) {
                    setDraftHtml(current.html);
                    setDraftName(current.name);
                  }
                }}
              >
                Cofnij
              </Button>
            </div>
          </Card>
          <Card padding="md">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-[var(--accent)]" />
              Podgląd (z przykładową treścią)
            </h3>
            <div className="rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-white">
              <iframe
                title="Layout preview"
                srcDoc={draftHtml
                  .replace(
                    "{{content}}",
                    '<p>Cześć Anna,</p><p>To jest przykładowa treść maila wyświetlana w layoutcie. <strong>Pogrubienie</strong>, <a href="#">link</a>, listy itd.</p><div class="button-container" style="text-align:center;margin:32px 0 8px 0;"><a href="#" class="button" style="display:inline-block;padding:14px 28px;background-color:#0c0c0e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Przykładowy CTA</a></div>',
                  )
                  .replace(/\{\{brand\.name\}\}/g, "MyPerformance")
                  .replace(/\{\{brand\.url\}\}/g, "https://myperformance.pl")
                  .replace(
                    /\{\{brand\.supportEmail\}\}/g,
                    "support@myperformance.pl",
                  )
                  .replace(/\{\{subject\}\}/g, "Przykładowy temat")}
                className="w-full"
                style={{ height: "720px", border: "none" }}
                sandbox="allow-same-origin"
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
