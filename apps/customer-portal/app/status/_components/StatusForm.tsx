"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { apiFetch } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TICKET_RE = /^ZS-\d{4}-[A-Z0-9]{4,8}$/i;

export function StatusForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [ticket, setTicket] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Wprowadź poprawny adres email.");
      return;
    }
    if (ticket && !TICKET_RE.test(ticket.trim())) {
      setError("Format numeru zlecenia: ZS-2026-XXXX.");
      return;
    }
    setLoading(true);
    const res = await apiFetch<{ ok: boolean }>("/auth/email-otp", {
      method: "POST",
      body: JSON.stringify({ email: trimmed }),
    });
    setLoading(false);
    if (!res.ok) {
      if (res.status === 429) {
        setError(
          "Zbyt wiele prób — spróbuj ponownie za kilka minut.",
        );
      } else if (res.status === 400) {
        setError("Wprowadź poprawny adres email.");
      } else {
        setError(
          "Nie udało się wysłać kodu. Sprawdź połączenie i spróbuj ponownie.",
        );
      }
      return;
    }
    const params = new URLSearchParams({ email: trimmed });
    router.push(`/status/verify?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? "form-error" : undefined}
          className="w-full rounded-lg border px-4 py-3.5 text-base outline-none transition-colors focus:border-[var(--accent)]"
          style={{
            borderColor: "var(--border-strong)",
            background: "var(--bg-main)",
          }}
          placeholder="email@example.com"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="ticket" className="block text-sm font-medium">
          Numer zlecenia{" "}
          <span style={{ color: "var(--text-light)" }}>(opcjonalnie)</span>
        </label>
        <input
          id="ticket"
          name="ticket"
          type="text"
          autoComplete="off"
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          className="w-full rounded-lg border px-4 py-3.5 text-base font-mono outline-none transition-colors focus:border-[var(--accent)]"
          style={{
            borderColor: "var(--border-strong)",
            background: "var(--bg-main)",
          }}
          placeholder="ZS-2026-XXXX"
        />
      </div>
      {error ? (
        <div
          id="form-error"
          role="alert"
          className="text-sm"
          style={{ color: "var(--danger)" }}
        >
          {error}
        </div>
      ) : null}
      <p
        className="text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        Otrzymasz kod jednorazowy na podany adres. Ważny przez 10 minut.
      </p>
      <div className="pt-2">
        <Button type="submit" loading={loading} size="lg" className="w-full sm:w-auto">
          Wyślij kod
        </Button>
      </div>
    </form>
  );
}
