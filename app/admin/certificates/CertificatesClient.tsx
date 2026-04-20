"use client";

import { useEffect, useState } from "react";
import type { IssuedCertificate } from "@/lib/step-ca";

type CaStatus = { online: boolean; url: string; provisioner?: string; provisionerType?: string; error?: string };
type AuditEvent = { ts: string; actor: string; action: string; subject?: string; ok: boolean; error?: string };

const ROLES = [
  { value: "sprzedawca", label: "Sprzedawca" },
  { value: "serwisant", label: "Serwisant" },
  { value: "kierowca", label: "Kierowca" },
  { value: "dokumenty_access", label: "Obieg dokumentów" },
] as const;

export function CertificatesClient({ initialCerts }: { initialCerts: IssuedCertificate[] }) {
  const [certs, setCerts] = useState(initialCerts);
  const [commonName, setCommonName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>(["sprzedawca"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [caStatus, setCaStatus] = useState<CaStatus | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const [s, a] = await Promise.all([
          fetch("/api/admin/certificates/ca-status").then((r) => r.json()),
          fetch("/api/admin/certificates/audit").then((r) => r.json()),
        ]);
        if (!mounted) return;
        setCaStatus(s);
        setAudit(a.events ?? []);
      } catch {}
    };
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (roles.length === 0) {
      setError("Zaznacz co najmniej jedną rolę.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commonName, email, roles }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const pwd = res.headers.get("X-Pkcs12-Password");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${commonName.replace(/[^a-zA-Z0-9_-]+/g, "_")}.p12`;
      a.click();
      URL.revokeObjectURL(url);
      if (pwd) {
        alert(`Certyfikat wystawiony.\n\nHasło do pliku .p12:\n\n${pwd}\n\nZapisz je — nie będzie wyświetlone ponownie.`);
      }
      const refreshed = await fetch("/api/admin/certificates").then((r) => r.json());
      setCerts(refreshed.certificates ?? []);
      setCommonName("");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Unieważnić certyfikat? Operacja jest nieodwracalna.")) return;
    await fetch(`/api/admin/certificates/${encodeURIComponent(id)}`, { method: "DELETE" });
    const refreshed = await fetch("/api/admin/certificates").then((r) => r.json());
    setCerts(refreshed.certificates ?? []);
  }

  return (
    <>
      <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-slate-100">Root CA</h2>
            <p className="text-xs text-slate-500 mt-1">Pobierz certyfikat wewnętrznej CA do instalacji w zaufanych kotwicach komputera / przeglądarki.</p>
            {caStatus ? (
              <p className="text-xs mt-2">
                Status CA:{" "}
                {caStatus.online ? (
                  <span className="text-emerald-400">online ({caStatus.provisioner ?? "brak provisionera"}, {caStatus.provisionerType ?? "?"})</span>
                ) : (
                  <span className="text-red-400">offline — {caStatus.error ?? "nieznany błąd"}</span>
                )}
              </p>
            ) : null}
          </div>
          <a
            href="/api/admin/certificates/root-ca"
            className="bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium px-4 py-2 rounded-lg"
          >
            Pobierz root-ca.pem
          </a>
        </div>
      </section>

      <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-medium text-slate-100 mb-4">Wystaw nowy certyfikat</h2>
        <form onSubmit={issue} className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Common Name</label>
            <input
              required
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              placeholder="Jan Kowalski"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jan@firma.pl"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition"
            >
              {busy ? "Wystawianie…" : "Wystaw i pobierz .p12"}
            </button>
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-300 mb-2">Role (można zaznaczyć kilka — 1 certyfikat do wielu paneli)</label>
            <div className="flex flex-wrap gap-4">
              {ROLES.map((r) => (
                <label key={r.value} className="inline-flex items-center gap-2 text-sm text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={roles.includes(r.value)}
                    onChange={(e) =>
                      setRoles((prev) =>
                        e.target.checked ? Array.from(new Set([...prev, r.value])) : prev.filter((x) => x !== r.value)
                      )
                    }
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-brand-600 focus:ring-brand-500"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
        </form>
        {error ? (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        ) : null}
        <p className="mt-3 text-xs text-slate-500">
          Plik .p12 zostanie pobrany automatycznie. Hasło zostanie wyświetlone jednorazowo w oknie potwierdzenia.
          Certyfikat jest podpisywany przez wewnętrzną CA <code className="text-brand-400">ca.myperformance.pl</code>.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-medium text-slate-100 mb-4">Wydane certyfikaty</h2>
        {certs.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-800/30 border border-dashed border-slate-700 rounded-xl p-8 text-center">
            Brak wystawionych certyfikatów. CA zostanie uruchomione w Fazie 2 — do tego czasu wystawianie pozostaje niedostępne.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-700">
                  <th className="py-2 px-3">Subject</th>
                  <th className="py-2 px-3">Rola</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Ważny do</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="py-2 px-3 text-slate-200">{c.subject}</td>
                    <td className="py-2 px-3 text-slate-300">{c.role}</td>
                    <td className="py-2 px-3 text-slate-300">{c.email}</td>
                    <td className="py-2 px-3 text-slate-300">{new Date(c.notAfter).toLocaleDateString("pl-PL")}</td>
                    <td className="py-2 px-3">
                      {c.revokedAt ? (
                        <span className="text-red-400">unieważniony</span>
                      ) : (
                        <span className="text-emerald-400">aktywny</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {!c.revokedAt ? (
                        <button
                          onClick={() => revoke(c.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Unieważnij
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-100 mb-4">Dziennik audytu (ostatnie zdarzenia)</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-800/30 border border-dashed border-slate-700 rounded-xl p-6 text-center">
            Brak zdarzeń — po restarcie procesu bufor jest czyszczony.
          </p>
        ) : (
          <div className="overflow-x-auto bg-slate-800/30 border border-slate-700 rounded-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-700">
                  <th className="py-2 px-3">Czas</th>
                  <th className="py-2 px-3">Admin</th>
                  <th className="py-2 px-3">Akcja</th>
                  <th className="py-2 px-3">Subject</th>
                  <th className="py-2 px-3">Wynik</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e, idx) => (
                  <tr key={idx} className="border-b border-slate-800/50">
                    <td className="py-2 px-3 text-slate-400 font-mono">{new Date(e.ts).toLocaleString("pl-PL")}</td>
                    <td className="py-2 px-3 text-slate-300">{e.actor}</td>
                    <td className="py-2 px-3 text-slate-300">{e.action}</td>
                    <td className="py-2 px-3 text-slate-300">{e.subject ?? "—"}</td>
                    <td className="py-2 px-3">
                      {e.ok ? <span className="text-emerald-400">ok</span> : <span className="text-red-400">błąd: {e.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
