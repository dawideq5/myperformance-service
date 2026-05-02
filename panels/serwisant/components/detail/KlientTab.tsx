"use client";

import { Mail, Phone, User } from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import { ChatwootDeepLink } from "../features/ChatwootDeepLink";

interface KlientTabProps {
  service: ServiceTicket;
}

export function KlientTab({ service }: KlientTabProps) {
  const customerName = [service.customerFirstName, service.customerLastName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-4">
      <Section title="Dane klienta">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field
            label="Imię i nazwisko"
            value={customerName || null}
            icon={<User className="w-3.5 h-3.5" />}
          />
          <Field
            label="Telefon"
            value={service.contactPhone}
            icon={<Phone className="w-3.5 h-3.5" />}
            href={
              service.contactPhone ? `tel:${service.contactPhone}` : undefined
            }
          />
          <Field
            label="E-mail"
            value={service.contactEmail}
            icon={<Mail className="w-3.5 h-3.5" />}
            href={
              service.contactEmail
                ? `mailto:${service.contactEmail}`
                : undefined
            }
          />
        </div>
      </Section>

      <ChatwootDeepLink
        serviceId={service.id}
        customerEmail={service.contactEmail ?? undefined}
        customerPhone={service.contactPhone ?? undefined}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-3 rounded-xl border"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <h3
        className="text-[11px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  icon,
  href,
}: {
  label: string;
  value: string | null;
  icon: React.ReactNode;
  href?: string;
}) {
  const content = (
    <span
      className="flex items-center gap-1.5 text-sm"
      style={{
        color: value ? "var(--text-main)" : "var(--text-muted)",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      <span className="truncate">{value ?? "—"}</span>
    </span>
  );
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      {href && value ? (
        <a href={href} className="hover:underline">
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}
