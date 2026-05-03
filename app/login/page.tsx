"use client";

import { Suspense, useCallback, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Alert, Button, ThemeToggle } from "@/components/ui";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Nie udało się rozpocząć logowania. Spróbuj ponownie.",
  OAuthCallback: "Serwer autoryzacji zwrócił błąd podczas logowania. Spróbuj ponownie.",
  OAuthCreateAccount: "Nie udało się utworzyć konta z danych dostawcy.",
  Callback: "Nie udało się zakończyć procesu logowania.",
  AccessDenied: "Nie masz uprawnień do tej aplikacji.",
  Configuration: "Nieprawidłowa konfiguracja serwera autoryzacji.",
  Default: "Wystąpił błąd podczas logowania. Spróbuj ponownie.",
  SessionRequired: "Twoja sesja wygasła. Zaloguj się ponownie.",
  SessionExpired: "Twoja sesja wygasła. Zaloguj się ponownie.",
  RefreshTokenExpired:
    "Sesja wygasła po dłuższej nieaktywności. Zaloguj się ponownie.",
};

function resolveErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.Default;
}

function LoginContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const rawCallbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const callbackUrl = rawCallbackUrl.startsWith("/") ? rawCallbackUrl : "/dashboard";
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
    <div className="w-full max-w-sm px-6">
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl p-8 shadow-[var(--shadow-card)]">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black tracking-tight text-[var(--text-main)]">
            MyPerformance
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            Zaloguj się, aby przejść do swoich aplikacji
          </p>
        </div>

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
          {submitting ? "Logowanie…" : "Zaloguj się"}
        </Button>
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
    <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center relative">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <Suspense fallback={<LoginFallback />}>
        <LoginContent />
      </Suspense>
    </div>
  );
}
