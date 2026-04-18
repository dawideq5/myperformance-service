"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Globe,
  Info,
  Settings,
  Shield as ShieldIcon,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  Alert,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Dialog,
} from "@/components/ui";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { ApiRequestError } from "@/lib/api-client";

import { useAccount } from "../AccountProvider";
import { googleService } from "../account-service";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied:
    "Odmówiono dostępu. Spróbuj ponownie lub skontaktuj się z administratorem.",
  link_not_completed:
    "Keycloak nie potwierdził powiązania konta Google. Spróbuj ponownie.",
  internal_error: "Wystąpił wewnętrzny błąd. Spróbuj ponownie później.",
  email_mismatch:
    "Email konta Google nie zgadza się z emailem w MyPerformance. Połączenie zostało anulowane.",
};

function resolveErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? `Błąd: ${code}`;
}

export function IntegrationsTab() {
  const { googleStatus, setGoogleConnected, refetchProfile, refetchGoogleStatus } =
    useAccount();
  const googleConnected = googleStatus?.connected === true;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [modalOpen, setModalOpen] = useState(false);
  const [featureEmail, setFeatureEmail] = useState(true);
  const [featureCalendar, setFeatureCalendar] = useState(true);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const googleLinking = searchParams.get("google_linking");
    const errorParam = searchParams.get("error");
    if (!googleLinking && !errorParam) return;

    const cleanUrl = () => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("google_linking");
      params.delete("error");
      const qs = params.toString();
      router.replace(qs ? `/account?${qs}` : "/account?tab=integrations", {
        scroll: false,
      });
    };

    if (errorParam && !googleLinking) {
      setError(errorParam);
      cleanUrl();
      return;
    }
    if (googleLinking !== "1") return;

    void (async () => {
      cleanUrl();
      const refreshed = await refetchGoogleStatus();
      if (!refreshed?.connected) {
        setSuccess(null);
        setError("link_not_completed");
        return;
      }
      setSuccess("Konto Google zostało pomyślnie powiązane.");
      try {
        const result = await googleService.provision();
        const parts: string[] = ["Konto Google powiązane."];
        if (result?.emailVerified?.ok) {
          parts.push("Email został potwierdzony jako zweryfikowany.");
        }
        if (result?.calendar?.ok) {
          parts.push("Utworzono wydarzenie w kalendarzu.");
        } else if (result?.calendar?.error) {
          parts.push("Nie udało się utworzyć wydarzenia w kalendarzu.");
        }
        setSuccess(parts.join(" "));
        await refetchProfile();
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === "email_mismatch") {
          setSuccess(null);
          setError("email_mismatch");
          await refetchGoogleStatus();
        }
      }
    })();
  }, [searchParams, router, refetchGoogleStatus, refetchProfile]);

  const handleOpenModal = useCallback(() => {
    setError(null);
    setSuccess(null);
    setFeatureEmail(true);
    setFeatureCalendar(true);
    setModalOpen(true);
  }, []);

  const connectAction = useAsyncAction(
    async () => {
      const features: string[] = [];
      if (featureEmail) features.push("email_verification");
      if (featureCalendar) features.push("calendar");
      if (features.length === 0) {
        throw new Error("Zaznacz przynajmniej jedną funkcję.");
      }
      await googleService.saveFeatures(features);
      setModalOpen(false);
      await signIn(
        "keycloak",
        {
          callbackUrl: "/account?tab=integrations&google_linking=1",
          redirect: true,
        },
        { kc_action: "idp_link:google" },
      );
    },
    {
      resolveError: (err) =>
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Wystąpił błąd podczas łączenia konta Google",
      onError: (err) => {
        const message =
          err instanceof Error ? err.message : "Nieznany błąd";
        setError(message);
      },
    },
  );

  const disconnectAction = useAsyncAction(
    async () => {
      await googleService.disconnect();
    },
    {
      onSuccess: () => {
        setGoogleConnected(false);
        setSuccess(null);
        setError(null);
        setConfirmingDisconnect(false);
        void refetchGoogleStatus();
        void refetchProfile();
      },
    },
  );

  const handleDisconnect = useCallback(() => {
    if (confirmingDisconnect) {
      disconnectAction.run();
    } else {
      setConfirmingDisconnect(true);
    }
  }, [confirmingDisconnect, disconnectAction]);

  const errorMessage = resolveErrorMessage(error);

  return (
    <div className="space-y-6">
      <Card padding="md">
        <CardHeader
          icon={<Globe className="w-6 h-6" aria-hidden="true" />}
          iconBgClassName={
            googleConnected
              ? "bg-green-500/10 text-green-500"
              : "bg-[var(--accent)]/10 text-[var(--accent)]"
          }
          title="Konto Google"
          description={
            googleConnected ? (
              <span className="text-green-500">Połączone</span>
            ) : (
              "Niepołączone"
            )
          }
          action={
            !googleConnected ? (
              <Button
                loading={connectAction.pending}
                rightIcon={
                  !connectAction.pending && (
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  )
                }
                onClick={handleOpenModal}
              >
                Połącz
              </Button>
            ) : confirmingDisconnect ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">
                  Na pewno?
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  loading={disconnectAction.pending}
                  onClick={handleDisconnect}
                >
                  Tak, odłącz
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmingDisconnect(false)}
                  disabled={disconnectAction.pending}
                >
                  Anuluj
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                leftIcon={<X className="w-4 h-4" aria-hidden="true" />}
                loading={disconnectAction.pending}
                onClick={handleDisconnect}
                className="border-red-500/30 text-red-500 hover:bg-red-500/10"
              >
                Odłącz
              </Button>
            )
          }
        />

        <div className="mt-6 space-y-4">
          {errorMessage && (
            <Alert tone="error" title="Błąd połączenia">
              {errorMessage}
            </Alert>
          )}

          {success && (
            <Alert tone="success" title="Połączenie zakończone powodzeniem">
              {success}
            </Alert>
          )}

          {googleConnected && !success && (
            <Alert tone="success" title="Konto Google jest połączone">
              Twoje konto Google zostało pomyślnie powiązane z systemem
              MyPerformance.
            </Alert>
          )}

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-[var(--text-main)]">
              Dostępne uprawnienia i funkcje
            </h3>
            <FeatureRow
              icon={
                <ShieldCheck
                  className="w-5 h-5 text-green-500"
                  aria-hidden="true"
                />
              }
              iconBg="bg-green-500/10"
              title="Weryfikacja adresu email"
              desc="Potwierdzanie, że Twoje konto w systemie MyPerformance jest powiązane ze zweryfikowaną tożsamością Google."
            />
            <FeatureRow
              icon={
                <Calendar
                  className="w-5 h-5 text-blue-500"
                  aria-hidden="true"
                />
              }
              iconBg="bg-blue-500/10"
              title="Kalendarz Google"
              desc="Tworzenie i odczytywanie wydarzeń w Twoim kalendarzu. Po połączeniu zyskujesz zakładkę Kalendarz z synchronizacją."
            />
          </div>

          <div className="p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
            <h3 className="text-sm font-medium text-[var(--text-main)] mb-3 flex items-center gap-2">
              <ShieldIcon
                className="w-4 h-4 text-[var(--accent)]"
                aria-hidden="true"
              />
              Czego NIE może robić system
            </h3>
            <ul className="space-y-2 text-sm text-[var(--text-muted)]">
              {[
                "Przeglądać lub czytać Twoje wiadomości email",
                "Wysyłać wiadomości w Twoim imieniu",
                "Usuwać wydarzeń z Twojego kalendarza Google",
                "Przeglądać Twoje pliki na Dysku Google",
                "Modyfikować ustawień konta Google poza uprawnieniami",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <X
                    className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
            <div className="flex items-start gap-3">
              <Info
                className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <h4 className="text-sm font-medium text-blue-400 mb-1">
                  Bezpieczeństwo i prywatność
                </h4>
                <p className="text-xs text-[var(--text-muted)]">
                  System działa na zasadzie{" "}
                  <strong>zasady najmniejszego przywileju</strong> — ma dostęp
                  wyłącznie do funkcji niezbędnych do działania. Dostęp możesz
                  w każdej chwili odwołać klikając przycisk &quot;Odłącz&quot;.
                </p>
              </div>
            </div>
          </div>

          {googleConnected && (
            <div className="p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
              <h4 className="text-sm font-medium text-[var(--text-main)] mb-2 flex items-center gap-2">
                <Settings className="w-4 h-4" aria-hidden="true" />
                Problemy z połączeniem?
              </h4>
              <p className="text-xs text-[var(--text-muted)]">
                Jeśli operacja się nie powiedzie (np. token wygasł lub
                odłączyłeś aplikację w ustawieniach Google), odłącz i ponownie
                połącz konto Google używając przycisku powyżej.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Wybierz funkcje integracji Google"
        description="Google poprosi o wszystkie te uprawnienia na ekranie zgody. Możesz odznaczyć te, których nie chcesz udzielić."
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={connectAction.pending}
            >
              Anuluj
            </Button>
            <Button
              loading={connectAction.pending}
              onClick={() => void connectAction.run()}
            >
              Połącz
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Checkbox
            checked={featureEmail}
            onChange={(e) => setFeatureEmail(e.target.checked)}
            label="Weryfikacja email"
            description="Potwierdź swój email przez Google (automatycznie oznacza email jako zweryfikowany)"
          />
          <Checkbox
            checked={featureCalendar}
            onChange={(e) => setFeatureCalendar(e.target.checked)}
            label="Kalendarz Google"
            description="Przeglądaj i twórz wydarzenia w Twoim Google Calendar z poziomu MyPerformance"
          />
        </div>
        {connectAction.error && (
          <div className="mt-4">
            <Alert tone="error">{connectAction.error}</Alert>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function FeatureRow({
  icon,
  iconBg,
  title,
  desc,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}
        >
          {icon}
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-[var(--text-main)]">
            {title}
          </h4>
          <p className="text-xs text-[var(--text-muted)] mt-1">{desc}</p>
          <div className="mt-2 flex items-center gap-1 text-xs text-green-500">
            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
            Dostępne
          </div>
        </div>
      </div>
    </div>
  );
}
