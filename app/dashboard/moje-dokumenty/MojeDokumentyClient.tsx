"use client";

import type { DocusealDocument } from "@/lib/docuseal";

const STATUS_LABEL: Record<DocusealDocument["status"], { label: string; cls: string }> = {
  pending: { label: "Do podpisu", cls: "text-amber-400" },
  completed: { label: "Podpisany", cls: "text-emerald-400" },
  declined: { label: "Odrzucony", cls: "text-red-400" },
  expired: { label: "Wygasł", cls: "text-slate-500" },
};

export function MojeDokumentyClient({
  documents,
  userEmail,
}: {
  documents: DocusealDocument[];
  userEmail: string;
}) {
  if (documents.length === 0) {
    return (
      <section className="bg-slate-800/30 border border-dashed border-slate-700 rounded-xl p-10 text-center">
        <h2 className="text-lg font-medium text-slate-200 mb-2">Brak dokumentów</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Gdy administrator wyśle do Ciebie dokument do podpisu, pojawi się on tutaj.
          Obecnie nie widzimy żadnych dokumentów powiązanych z adresem <strong>{userEmail}</strong>.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {documents.map((doc) => {
        const status = STATUS_LABEL[doc.status] ?? { label: doc.status, cls: "text-slate-400" };
        const mySigner = doc.signers.find((s) => s.email === userEmail);
        return (
          <article
            key={doc.id}
            className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 flex items-center justify-between gap-4"
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-slate-100 font-medium truncate">{doc.name}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Utworzony {new Date(doc.createdAt).toLocaleString("pl-PL")}
                {doc.completedAt ? ` · Podpisany ${new Date(doc.completedAt).toLocaleString("pl-PL")}` : ""}
              </p>
            </div>
            <div className={`text-sm font-medium ${status.cls}`}>{status.label}</div>
            <div className="flex-shrink-0">
              {mySigner?.status !== "completed" && doc.signUrl ? (
                <a
                  href={doc.signUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Podpisz
                </a>
              ) : doc.downloadUrl ? (
                <a
                  href={doc.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center border border-slate-600 text-slate-200 hover:bg-slate-700 text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Pobierz
                </a>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
