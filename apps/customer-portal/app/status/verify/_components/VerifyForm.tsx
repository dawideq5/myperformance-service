"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { apiFetch } from "@/lib/api";

interface Props {
  email: string;
}

export function VerifyForm({ email }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const cleaned = code.replace(/\D/g, "");
    if (cleaned.length !== 6) {
      setError("Wprowadź 6-cyfrowy kod.");
      return;
    }
    if (!email) {
      setError("Brak adresu email — wróć i wpisz go ponownie.");
      return;
    }
    setLoading(true);
    const res = await apiFetch<{ ok: boolean }>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, code: cleaned }),
    });
    setLoading(false);
    if (!res.ok) {
      if (res.status === 401) {
        setError("Niepoprawny kod albo przedawnione okno czasu.");
      } else if (res.status === 429) {
        setError("Zbyt wiele prób — odczekaj chwilę.");
      } else {
        setError("Nie udało się zweryfikować kodu.");
      }
      setCode("");
      return;
    }
    router.push("/status/results");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="otp-code" className="block text-sm font-medium">
          Kod 6-cyfrowy
        </label>
        <input
          id="otp-code"
          name="otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          pattern="\d{6}"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-describedby={error ? "otp-error" : undefined}
          className="w-full rounded-lg border px-3 py-3 text-2xl tracking-[0.5em] font-mono outline-none focus:border-[var(--accent)] text-center"
          style={{ borderColor: "var(--border-strong)" }}
          placeholder="------"
          aria-label="Kod 6-cyfrowy"
        />
      </div>
      {error ? (
        <div
          id="otp-error"
          role="alert"
          className="text-sm"
          style={{ color: "var(--danger)" }}
        >
          {error}
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={loading} size="lg">
          Zweryfikuj
        </Button>
        <a
          href={`/status${email ? `?email=${encodeURIComponent(email)}` : ""}`}
          className="text-sm hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          Wyślij kod ponownie
        </a>
      </div>
    </form>
  );
}
