"use client";

import { useState } from "react";
import { Mail, Pencil, Phone, User } from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import { ChatwootDeepLink } from "../features/ChatwootDeepLink";
import { CustomerMessageSender } from "../features/CustomerMessageSender";
import { EditCustomerModal } from "./EditCustomerModal";

interface KlientTabProps {
  service: ServiceTicket;
  /** Wave 20 / Faza 1D — callback po zapisie edycji danych klienta. */
  onUpdate?: (updated: ServiceTicket) => void;
  /** Wave 20 / Faza 1F — bumpowane przez ServiceDetailView na SSE eventy
   *  `customer_message_sent` / `chat_message_received` żeby ChatwootDeepLink
   *  re-fetchował komunikację. */
  realtimeVersion?: number;
}

export function KlientTab({
  service,
  onUpdate,
  realtimeVersion = 0,
}: KlientTabProps) {
  const customerName = [service.customerFirstName, service.customerLastName]
    .filter(Boolean)
    .join(" ");
  const [editorOpen, setEditorOpen] = useState(false);
  // Local refresh trigger — inkrementowany po sukcesie sender'a, sumowany
  // z realtimeVersion z parenta. Razem dają unikalny refreshKey dla
  // ChatwootDeepLink.
  const [localRefresh, setLocalRefresh] = useState(0);
  const refreshKey = realtimeVersion + localRefresh;

  return (
    <div className="space-y-4">
      <Section
        title="Dane klienta"
        action={
          onUpdate ? (
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              <Pencil className="w-3 h-3" />
              Edytuj
            </button>
          ) : null
        }
      >
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

      <CustomerMessageSender
        serviceId={service.id}
        customerEmail={service.contactEmail}
        customerPhone={service.contactPhone}
        onSent={() => setLocalRefresh((v) => v + 1)}
      />

      <ChatwootDeepLink
        serviceId={service.id}
        customerEmail={service.contactEmail ?? undefined}
        customerPhone={service.contactPhone ?? undefined}
        refreshKey={refreshKey}
      />

      {editorOpen && onUpdate && (
        <EditCustomerModal
          service={service}
          onClose={() => setEditorOpen(false)}
          onSaved={(updated) => {
            onUpdate(updated);
            setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-3 rounded-xl border"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          {title}
        </h3>
        {action}
      </div>
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
