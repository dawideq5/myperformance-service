"use client";

import { Activity } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import type { AuditEvent } from "@/lib/services/certificates-service";

export function AuditLogPanel({ audit }: { audit: AuditEvent[] }) {
  return (
    <Card padding="lg">
      <CardHeader
        icon={<Activity className="w-6 h-6 text-[var(--accent)]" />}
        title="Dziennik audytu"
        description="Ostatnie zdarzenia wystawień, wysyłek e-mail i unieważnień."
      />
      {audit.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--text-muted)] text-center py-10">
          Brak zdarzeń.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border-subtle)]">
                <th className="py-2 px-3 font-medium">Czas</th>
                <th className="py-2 px-3 font-medium">Użytkownik</th>
                <th className="py-2 px-3 font-medium">Akcja</th>
                <th className="py-2 px-3 font-medium">Subject</th>
                <th className="py-2 px-3 font-medium">Wynik</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e, idx) => {
                const actorName =
                  (e as { actorName?: string | null }).actorName ?? null;
                const displayActor = actorName && actorName.length > 0
                  ? actorName
                  : e.actor;
                return (
                <tr key={idx} className="border-b border-[var(--border-subtle)]/50">
                  <td className="py-2 px-3 text-[var(--text-muted)] font-mono whitespace-nowrap">
                    {new Date(e.ts).toLocaleString("pl-PL")}
                  </td>
                  <td className="py-2 px-3 text-[var(--text-muted)]">{displayActor}</td>
                  <td className="py-2 px-3 text-[var(--text-main)]">{e.action}</td>
                  <td className="py-2 px-3 text-[var(--text-muted)]">
                    {e.subject ?? "—"}
                  </td>
                  <td className="py-2 px-3">
                    {e.ok ? (
                      <Badge tone="success">ok</Badge>
                    ) : (
                      <Badge tone="danger" title={e.error}>
                        błąd
                      </Badge>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
