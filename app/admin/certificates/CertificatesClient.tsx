"use client";

import { useState } from "react";
import type { IssuedCertificate } from "@/lib/step-ca";

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
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("sprzedawca");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commonName, email, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${commonName.replace(/[^a-zA-Z0-9_-]+/g, "_")}.p12`;
      a.click();
      URL.revokeObjectURL(url);
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
      <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-medium text-slate-100 mb-4">Wystaw nowy certyfikat</h2>
        <form onSubmit={issue} className="grid md:grid-cols-4 gap-4">
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
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Rola</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
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
    </>
  );
}
