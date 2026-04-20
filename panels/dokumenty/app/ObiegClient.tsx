"use client";

import { useState } from "react";
import type { DocusealSubmission, DocusealTemplate } from "@/lib/docuseal";

const STATUS: Record<DocusealSubmission["status"], { label: string; cls: string }> = {
  pending: { label: "W toku", cls: "text-amber-400" },
  completed: { label: "Podpisany", cls: "text-emerald-400" },
  declined: { label: "Odrzucony", cls: "text-red-400" },
  expired: { label: "Wygasł", cls: "text-slate-500" },
};

export function ObiegClient({
  templates,
  submissions,
  configured,
  docusealUrl,
}: {
  templates: DocusealTemplate[];
  submissions: DocusealSubmission[];
  configured: boolean;
  docusealUrl: string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const [templateId, setTemplateId] = useState<number | "">("");
  const [recipients, setRecipients] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendOk, setSendOk] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || file.name, pdfBase64: b64 }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const data = await res.json();
      window.open(data.editUrl, "_blank");
      location.reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setUploadBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSendOk(false);
    setSendBusy(true);
    try {
      const emails = recipients
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!templateId || emails.length === 0) throw new Error("Wskaż szablon i przynajmniej jednego odbiorcę");
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, recipients: emails }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setSendOk(true);
      setRecipients("");
      setTemplateId("");
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setSendBusy(false);
    }
  }

  return (
    <>
      <div className="grid lg:grid-cols-2 gap-6 mb-10">
        <section className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-lg font-medium text-slate-100 mb-4">1. Wyślij PDF i oznacz pola</h2>
          <form onSubmit={upload} className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nazwa szablonu (opcjonalnie)"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
            />
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white"
            />
            <button
              type="submit"
              disabled={!configured || uploadBusy || !file}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-medium py-2 rounded-lg"
            >
              {uploadBusy ? "Wysyłanie…" : "Prześlij i otwórz edytor pól"}
            </button>
            {uploadError ? <p className="text-sm text-red-400">{uploadError}</p> : null}
            <p className="text-xs text-slate-500">
              Po przesłaniu otworzymy edytor Docuseal w nowej karcie — tam zaznaczasz pola do podpisu.
            </p>
          </form>
        </section>

        <section className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-lg font-medium text-slate-100 mb-4">2. Skieruj szablon do pracowników</h2>
          <form onSubmit={send} className="space-y-3">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : "")}
              required
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
            >
              <option value="">— wybierz szablon —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.fieldsCount} pól)
                </option>
              ))}
            </select>
            <textarea
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              rows={4}
              placeholder="adres1@firma.pl, adres2@firma.pl"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
            />
            <button
              type="submit"
              disabled={!configured || sendBusy}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-medium py-2 rounded-lg"
            >
              {sendBusy ? "Wysyłanie…" : "Wyślij do podpisu"}
            </button>
            {sendError ? <p className="text-sm text-red-400">{sendError}</p> : null}
            {sendOk ? <p className="text-sm text-emerald-400">Wysłano. Powiadomienia trafią na adresy email.</p> : null}
          </form>
        </section>
      </div>

      <section>
        <h2 className="text-lg font-medium text-slate-100 mb-4">Ostatnie wysyłki</h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-800/30 border border-dashed border-slate-700 rounded-xl p-6 text-center">
            Brak wysyłek. Skorzystaj z formularza powyżej aby wysłać pierwszy dokument.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-left border-b border-slate-700">
                  <th className="py-2 px-3">Dokument</th>
                  <th className="py-2 px-3">Odbiorcy</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Utworzono</th>
                  <th className="py-2 px-3">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => {
                  const st = STATUS[s.status] ?? { label: s.status, cls: "text-slate-400" };
                  return (
                    <tr key={s.id} className="border-b border-slate-800">
                      <td className="py-2 px-3 text-slate-200">{s.name}</td>
                      <td className="py-2 px-3 text-slate-300">
                        {s.submitters.map((x) => x.email).join(", ")}
                      </td>
                      <td className={`py-2 px-3 font-medium ${st.cls}`}>{st.label}</td>
                      <td className="py-2 px-3 text-slate-400">
                        {new Date(s.createdAt).toLocaleString("pl-PL")}
                      </td>
                      <td className="py-2 px-3">
                        {docusealUrl ? (
                          <a
                            href={`${docusealUrl}/submissions/${s.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-400 hover:text-brand-300 text-xs font-medium"
                          >
                            Otwórz w Docuseal →
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      resolve(s.split(",")[1] ?? s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
