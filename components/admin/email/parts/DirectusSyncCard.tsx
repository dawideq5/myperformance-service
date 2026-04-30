"use client";

import { useState } from "react";
import { Layers } from "lucide-react";

import { Alert, Button, Card } from "@/components/ui";

export function DirectusSyncCard() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  async function runSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/directus-sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setResult({
          ok: false,
          message: json.error?.message ?? `Błąd ${res.status}`,
        });
      } else {
        setResult({
          ok: json.data.ok,
          message: `Zsynchronizowano: ${json.data.itemsSynced} rekordów do ${json.data.collectionsCreated} kolekcji.${json.data.errors?.length ? ` Błędy: ${json.data.errors.join("; ")}` : ""}`,
        });
      }
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card padding="md">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <Layers className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-[var(--text-main)]">
            Synchronizacja z Directus CMS
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
            Push read-only mirror brandingu i szablonów do Directusa — content
            team widzi aktualne wartości w UI Directusa, ale dashboard pozostaje
            canonical source-of-truth. Powtórny sync nadpisuje to co w
            Directusie.
          </p>
          {result && (
            <Alert tone={result.ok ? "success" : "error"} className="mt-3">
              {result.message}
            </Alert>
          )}
        </div>
        <Button
          onClick={runSync}
          loading={syncing}
          variant="secondary"
          size="sm"
        >
          Synchronizuj
        </Button>
      </div>
    </Card>
  );
}
