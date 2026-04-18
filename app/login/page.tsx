"use client";

import { Suspense, useCallback, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Alert, Button } from "@/components/ui";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Nie udało się rozpocząć logowania. Spróbuj ponownie.",
  OAuthCallback: "Keycloak zwrócił błąd podczas logowania. Spróbuj ponownie.",
  OAuthCreateAccount: "Nie udało się utworzyć konta z danych dostawcy.",
  Callback: "Nie udało się zakończyć procesu logowania.",
  AccessDenied: "Nie masz uprawnień do tej aplikacji.",
  Configuration: "Nieprawidłowa konfiguracja serwera autoryzacji.",
  Default: "Wystąpił błąd podczas logowania. Spróbuj ponownie.",
  SessionRequired: "Twoja sesja wygasła. Zaloguj się ponownie.",
};

function resolveErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.Default;
}

function LoginContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = useCallback(async () => {
    setSubmitting(true);
    try {
      await signIn("keycloak", { callbackUrl });
    } finally {
      setSubmitting(false);
    }
  }, [callbackUrl]);

  const errorMessage = resolveErrorMessage(errorCode);

  return (
    <div className="w-full max-w-md px-6">
      <div className="flex flex-col items-center text-center">
        <div className="mb-10">
          <h1 className="text-3xl font-black tracking-tight text-[var(--text-main)]">
            MyPerformance
          </h1>
          <div className="h-1 w-8 bg-[var(--accent)] mx-auto rounded-full mt-3" />
        </div>

        <div className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl p-8 shadow-xl shadow-black/5">
          <h2 className="text-xl font-bold text-[var(--text-main)]">
            Witaj z powrotem
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1 mb-6">
            Zaloguj się bezpiecznie przez Keycloak
          </p>

          {errorMessage && (
            <div className="mb-6">
              <Alert tone="error" title="Błąd autoryzacji">
                {errorMessage}
              </Alert>
            </div>
          )}

          <Button
            onClick={handleLogin}
            loading={submitting}
            fullWidth
            size="lg"
            rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
          >
            Kontynuuj
          </Button>
        </div>

        <p className="mt-10 text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-muted)] opacity-60">
          Identity Management
        </p>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div
      aria-live="polite"
      className="text-xs uppercase tracking-widest font-bold text-[var(--text-muted)] animate-pulse"
    >
      Inicjalizacja…
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center transition-colors duration-500">
      <Suspense fallback={<LoginFallback />}>
        <LoginContent />
      </Suspense>
    </div>
  );
}
