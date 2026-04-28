"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  History,
  Loader2,
  ScanLine,
  X,
} from "lucide-react";

interface HistoryItem {
  id: string;
  ticketNumber: string;
  status: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  diagnosis: string | null;
  amountFinal: number | null;
  amountEstimate: number | null;
  createdAt: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  received: "Przyjęty",
  diagnosing: "Diagnoza",
  awaiting_quote: "Wycena",
  repairing: "Naprawa",
  testing: "Testy",
  ready: "Gotowy",
  delivered: "Wydany",
  cancelled: "Anulowany",
  archived: "Archiwum",
};

function isImeiFormat(v: string) {
  return /^[0-9]{14,15}$/.test(v.trim());
}

function isValidLuhn(imei: string) {
  const v = imei.trim();
  if (!isImeiFormat(v)) return false;
  if (v.length === 14) return true;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(v[14 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function ImeiField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [checking, setChecking] = useState(false);
  const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced lookup po validate-able IMEI:
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setHistory([]);
    if (!isImeiFormat(value)) {
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(
          `/api/relay/services/by-imei?imei=${encodeURIComponent(value.trim())}`,
        );
        const json = await res.json();
        setHistory(json.history ?? []);
      } catch {
        /* ignore */
      } finally {
        setChecking(false);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const luhnOk = value && isImeiFormat(value) ? isValidLuhn(value) : null;
  const formatOk = value ? isImeiFormat(value) : null;

  return (
    <div className="space-y-2">
      <label className="block">
        <span
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          IMEI / SN
        </span>
        <div className="relative">
          <ScanLine
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) =>
              onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 15))
            }
            placeholder="15 cyfr (lub 14 — bez checksum)"
            className="w-full pl-9 pr-10 py-2 rounded-xl border text-sm outline-none font-mono transition-colors focus:border-[var(--accent)]"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {checking ? (
              <Loader2
                className="w-4 h-4 animate-spin"
                style={{ color: "var(--text-muted)" }}
              />
            ) : formatOk === false ? (
              <span
                className="text-[10px] font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                {value.length}/15
              </span>
            ) : luhnOk === true ? (
              <CheckCircle2 className="w-4 h-4" style={{ color: "#22C55E" }} />
            ) : luhnOk === false ? (
              <AlertTriangle className="w-4 h-4" style={{ color: "#F59E0B" }} />
            ) : null}
          </div>
        </div>
        {luhnOk === false && (
          <p
            className="text-[11px] mt-1 flex items-center gap-1"
            style={{ color: "#F59E0B" }}
          >
            <AlertTriangle className="w-3 h-3" />
            Suma kontrolna IMEI nie zgadza się — sprawdź wpisany numer.
          </p>
        )}
      </label>

      {history.length > 0 && (
        <div
          className="rounded-2xl border overflow-hidden animate-fade-in"
          style={{
            background:
              "linear-gradient(135deg, rgba(245, 158, 11, 0.06), rgba(245, 158, 11, 0.02))",
            borderColor: "rgba(245, 158, 11, 0.3)",
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2 border-b"
            style={{ borderColor: "rgba(245, 158, 11, 0.2)" }}
          >
            <History className="w-4 h-4" style={{ color: "#F59E0B" }} />
            <span
              className="text-xs font-semibold"
              style={{ color: "#F59E0B" }}
            >
              To urządzenie było już serwisowane ({history.length}×)
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setPreviewItem(h)}
                className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-[var(--bg-surface)]/50 transition-colors border-b last:border-b-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] font-bold">
                      {h.ticketNumber}
                    </span>
                    <span
                      className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--bg-surface)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {STATUS_LABELS[h.status] ?? h.status}
                    </span>
                  </div>
                  {h.description && (
                    <p
                      className="text-xs mt-0.5 truncate"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {h.description}
                    </p>
                  )}
                </div>
                <div className="text-right text-[10px] flex-shrink-0">
                  {h.createdAt && (
                    <div style={{ color: "var(--text-muted)" }}>
                      {new Date(h.createdAt).toLocaleDateString("pl")}
                    </div>
                  )}
                  <Eye
                    className="w-3.5 h-3.5 mt-0.5 ml-auto"
                    style={{ color: "var(--text-muted)" }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {previewItem && (
        <HistoryPreviewDialog
          item={previewItem}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </div>
  );
}

function HistoryPreviewDialog({
  item,
  onClose,
}: {
  item: HistoryItem;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border overflow-hidden shadow-2xl"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div>
            <div className="font-mono text-sm font-semibold">
              {item.ticketNumber}
            </div>
            <div className="text-[10px] uppercase opacity-70 mt-0.5">
              {STATUS_LABELS[item.status] ?? item.status}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <Row label="Urządzenie" value={[item.brand, item.model].filter(Boolean).join(" ") || "—"} />
          {item.description && <Row label="Opis usterki" value={item.description} />}
          {item.diagnosis && <Row label="Diagnoza" value={item.diagnosis} />}
          {item.amountFinal != null && (
            <Row label="Kwota końcowa" value={`${item.amountFinal} PLN`} />
          )}
          {item.amountEstimate != null && item.amountFinal == null && (
            <Row
              label="Wycena"
              value={`~${item.amountEstimate} PLN`}
            />
          )}
          {item.createdAt && (
            <Row
              label="Data przyjęcia"
              value={new Date(item.createdAt).toLocaleDateString("pl", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="text-[10px] uppercase font-semibold tracking-wider mb-0.5"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
