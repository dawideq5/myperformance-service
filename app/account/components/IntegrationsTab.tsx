"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  Check,
  ChevronRight,
  Clock,
  GraduationCap,
  Globe,
  Info,
  Settings,
  X,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
} from "@/components/ui";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { ApiRequestError } from "@/lib/api-client";

import { useAccount } from "../AccountProvider";
import {
  googleService,
  kadromierzService,
  moodleService,
} from "../account-service";

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

type TileStatus =
  | { tone: "ok"; label: string }
  | { tone: "warning"; label: string }
  | { tone: "idle"; label: string };

/**
 * A single integration card with a unified layout: icon + title + status +
 * primary action ("Skonfiguruj" / "Odłącz"). Children render any
 * integration-specific body (feature list, feedback, secondary forms).
 */
function IntegrationTile({
  title,
  description,
  icon,
  iconBg,
  connected,
  status,
  configureLabel = "Skonfiguruj",
  disconnectLabel = "Odłącz",
  onConfigure,
  onDisconnect,
  configuring,
  disconnecting,
  canConfigure = true,
  canDisconnect = true,
  secondary,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  connected: boolean;
  status?: TileStatus;
  configureLabel?: string;
  disconnectLabel?: string;
  onConfigure?: () => void;
  onDisconnect?: () => void;
  configuring?: boolean;
  disconnecting?: boolean;
  canConfigure?: boolean;
  canDisconnect?: boolean;
  secondary?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!connected) setConfirming(false);
  }, [connected]);

  const toneClass =
    status?.tone === "ok"
      ? "text-green-500"
      : status?.tone === "warning"
        ? "text-yellow-500"
        : "text-[var(--text-muted)]";

  return (
    <Card padding="md">
      <CardHeader
        icon={icon}
        iconBgClassName={iconBg}
        title={title}
        description={
          status ? (
            <span className={toneClass}>{status.label}</span>
          ) : (
            description
          )
        }
        action={
          connected ? (
            confirming ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">
                  Na pewno?
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  loading={disconnecting}
                  onClick={() => {
                    if (onDisconnect) onDisconnect();
                  }}
                  disabled={!canDisconnect}
                >
                  Tak, odłącz
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirming(false)}
                  disabled={disconnecting}
                >
                  Anuluj
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                leftIcon={<X className="w-4 h-4" aria-hidden="true" />}
                onClick={() => setConfirming(true)}
                className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                disabled={!canDisconnect}
              >
                {disconnectLabel}
              </Button>
            )
          ) : (
            <Button
              loading={configuring}
              rightIcon={
                !configuring && (
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                )
              }
              onClick={onConfigure}
              disabled={!canConfigure || !onConfigure}
            >
              {configureLabel}
            </Button>
          )
        }
      />
      {(description || secondary || children) && (
        <div className="mt-6 space-y-4">
          {status && (
            <p className="text-sm text-[var(--text-muted)]">{description}</p>
          )}
          {secondary}
          {children}
        </div>
      )}
    </Card>
  );
}

export function IntegrationsTab() {
  return (
    <div className="space-y-6">
      <GoogleCard />
      <KadromierzCard />
      <MoodleCard />
    </div>
  );
}

function GoogleCard() {
  const {
    googleStatus,
    setGoogleConnected,
    refetchProfile,
    refetchGoogleStatus,
  } = useAccount();
  const googleConnected = googleStatus?.connected === true;
  const router = useRouter();
  const searchParams = useSearchParams();

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

  const configureAction = useAsyncAction(
    async () => {
      await googleService.saveFeatures(["email_verification", "calendar"]);
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
        void refetchGoogleStatus();
        void refetchProfile();
      },
    },
  );

  const errorMessage = resolveErrorMessage(error);

  return (
    <IntegrationTile
      title="Konto Google"
      description="Logowanie, weryfikacja e-maila i Google Calendar w jednym kafelku."
      icon={<Globe className="w-6 h-6" aria-hidden="true" />}
      iconBg={
        googleConnected
          ? "bg-green-500/10 text-green-500"
          : "bg-[var(--accent)]/10 text-[var(--accent)]"
      }
      connected={googleConnected}
      status={
        googleConnected
          ? { tone: "ok", label: "Połączone" }
          : { tone: "idle", label: "Niepołączone" }
      }
      configureLabel="Skonfiguruj"
      disconnectLabel="Odłącz"
      onConfigure={() => void configureAction.run()}
      onDisconnect={() => void disconnectAction.run()}
      configuring={configureAction.pending}
      disconnecting={disconnectAction.pending}
      secondary={
        <>
          {errorMessage && (
            <Alert tone="error" title="Błąd połączenia">
              {errorMessage}
            </Alert>
          )}
          {success && (
            <Alert tone="success" title="Sukces">
              {success}
            </Alert>
          )}
          {googleConnected && !success && (
            <Alert tone="success" title="Konto Google jest połączone">
              Masz aktywny dostęp do Gmail-verify oraz Google Calendar.
            </Alert>
          )}
        </>
      }
    >
      <FeatureRow
        title="Weryfikacja adresu e-mail"
        desc="Potwierdzamy, że konto jest powiązane z zweryfikowaną tożsamością Google."
      />
      <FeatureRow
        title="Google Calendar"
        desc="Dwukierunkowa synchronizacja wydarzeń z Twoim kalendarzem Google."
      />
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
              Zasada najmniejszego przywileju — brak dostępu do poczty,
              plików czy ustawień konta Google poza zakresem integracji.
            </p>
          </div>
        </div>
      </div>
    </IntegrationTile>
  );
}

function KadromierzCard() {
  const { kadromierzStatus, refetchKadromierzStatus, setKadromierzStatus } =
    useAccount();
  const [apiKey, setApiKey] = useState("");
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);

  const connected = kadromierzStatus?.connected === true;
  const stale = kadromierzStatus?.stale === true;
  const masterMode = kadromierzStatus?.masterKeyConfigured === true;
  const emailVerified = kadromierzStatus?.emailVerified === true;

  const connectAction = useAsyncAction(
    async () => {
      if (masterMode && !showManualFallback) {
        return kadromierzService.connect();
      }
      if (!apiKey.trim()) {
        throw new Error("Wprowadź klucz API Kadromierza");
      }
      return kadromierzService.connect(apiKey.trim());
    },
    {
      onSuccess: (status) => {
        setKadromierzStatus(status);
        setApiKey("");
        setShowManualFallback(false);
        setFeedback({
          tone: "success",
          message:
            status.mode === "master"
              ? "Połączono przez firmowy token (konto zidentyfikowane po emailu)."
              : "Połączono z Kadromierzem.",
        });
      },
      onError: (err) => {
        setFeedback({
          tone: "error",
          message:
            err instanceof ApiRequestError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Nie udało się połączyć",
        });
      },
    },
  );

  const disconnectAction = useAsyncAction(
    async () => kadromierzService.disconnect(),
    {
      onSuccess: () => {
        setKadromierzStatus({ connected: false });
        setFeedback(null);
        void refetchKadromierzStatus();
      },
    },
  );

  const statusLabel: TileStatus = connected
    ? {
        tone: "ok",
        label: kadromierzStatus?.email
          ? `Połączone — ${kadromierzStatus.email}`
          : "Połączone",
      }
    : masterMode
      ? { tone: "idle", label: "Niepołączone" }
      : { tone: "warning", label: "Firmowy token nieskonfigurowany" };

  const canConfigure = !connected && (masterMode || showManualFallback);

  return (
    <IntegrationTile
      title="Kadromierz"
      description="Grafik pracy, przerwy i ewidencja czasu — podpięte do kalendarza."
      icon={<Clock className="w-6 h-6" aria-hidden="true" />}
      iconBg={
        connected
          ? "bg-green-500/10 text-green-500"
          : "bg-orange-500/10 text-orange-500"
      }
      connected={connected}
      status={statusLabel}
      configureLabel={
        masterMode && !showManualFallback
          ? "Skonfiguruj"
          : "Połącz kluczem API"
      }
      onConfigure={
        masterMode && !showManualFallback
          ? () => void connectAction.run()
          : () => void connectAction.run()
      }
      onDisconnect={() => void disconnectAction.run()}
      configuring={connectAction.pending}
      disconnecting={disconnectAction.pending}
      canConfigure={canConfigure && (emailVerified || showManualFallback)}
      secondary={
        <>
          {stale && (
            <Alert tone="warning" title="Sprawdź konto Kadromierz">
              Kadromierz odpowiada nieoczekiwanie. Jeśli problem się powtórzy,
              odłącz i połącz konto ponownie.
            </Alert>
          )}
          {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}

          {!connected && !emailVerified && (
            <Alert tone="warning" title="Wymagana weryfikacja e-maila">
              Zanim połączymy konto, potwierdź swój adres e-mail. Zapytaj
              administratora o ponowne wysłanie linku weryfikacyjnego lub
              sprawdź skrzynkę.
            </Alert>
          )}

          {!connected && !masterMode && !showManualFallback && (
            <Alert tone="info" title="Integracja w konfiguracji">
              Administrator nie skonfigurował jeszcze firmowego tokenu
              Kadromierza. Skontaktuj się z osobą zarządzającą systemem —
              gdy token zostanie ustawiony, podłączenie zajmie jedno
              kliknięcie.
            </Alert>
          )}

          {!connected && showManualFallback && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void connectAction.run();
              }}
              className="space-y-3"
            >
              <Input
                label="Osobisty klucz API Kadromierza"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="ddafc758-9737-4807-..."
                disabled={connectAction.pending}
                autoComplete="off"
                required
              />
              <p className="text-xs text-[var(--text-muted)]">
                Klucz znajdziesz w ustawieniach swojego konta Kadromierz
                (Profil → Tokeny API). Przechowujemy go zaszyfrowany w
                atrybutach Keycloaka i używamy wyłącznie po stronie serwera.
              </p>
              <div className="flex gap-2">
                <Button type="submit" loading={connectAction.pending}>
                  Połącz
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowManualFallback(false)}
                >
                  Wróć
                </Button>
              </div>
            </form>
          )}
          {!connected && !showManualFallback && (
            <button
              type="button"
              onClick={() => setShowManualFallback(true)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] underline underline-offset-2"
            >
              Mam własny osobisty klucz API Kadromierza →
            </button>
          )}
        </>
      }
    >
      <FeatureRow
        title="Start / Przerwa / Koniec pracy"
        desc="Rejestruj czas pracy jednym kliknięciem z widżetu na dashboardzie."
      />
      <FeatureRow
        title="Grafik w kalendarzu"
        desc="Twoje zaplanowane zmiany pojawiają się automatycznie w kalendarzu MyPerformance."
      />
    </IntegrationTile>
  );
}

function MoodleCard() {
  const { moodleStatus, refetchMoodleStatus, setMoodleStatus } = useAccount();
  const connected = moodleStatus?.connected === true;
  const hasRole = moodleStatus?.hasRole === true;
  const configured = moodleStatus?.configured !== false;
  const reason = moodleStatus?.reason;

  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);

  const connectAction = useAsyncAction(
    async () => moodleService.reconnect(),
    {
      // Optimistic flip: the endpoint returns 200 but the status route takes
      // a beat to refresh KC attributes — flip locally so the card's
      // Skonfiguruj/Odłącz button updates instantly, then reconcile via
      // refetch.
      onSuccess: async () => {
        setMoodleStatus(
          moodleStatus
            ? { ...moodleStatus, connected: true, userDisconnected: false }
            : { connected: true },
        );
        await refetchMoodleStatus();
        setFeedback({
          tone: "success",
          message: "Akademia została podłączona do kalendarza.",
        });
      },
      onError: (err) => {
        setFeedback({
          tone: "error",
          message:
            err instanceof ApiRequestError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Nie udało się połączyć",
        });
      },
    },
  );

  const disconnectAction = useAsyncAction(
    async () => moodleService.disconnect(),
    {
      onSuccess: async () => {
        setMoodleStatus(
          moodleStatus
            ? { ...moodleStatus, connected: false, userDisconnected: true }
            : { connected: false },
        );
        await refetchMoodleStatus();
        setFeedback({
          tone: "success",
          message: "Akademia została odłączona od kalendarza.",
        });
      },
      onError: (err) => {
        setFeedback({
          tone: "error",
          message:
            err instanceof ApiRequestError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Nie udało się odłączyć",
        });
      },
    },
  );

  const statusLabel: TileStatus = !hasRole
    ? { tone: "idle", label: "Brak roli Moodle" }
    : reason === "not_provisioned"
      ? {
          tone: "warning",
          label: "Konto Akademii czeka na inicjalizację",
        }
      : reason === "unreachable"
        ? { tone: "warning", label: "Akademia chwilowo niedostępna" }
        : connected
          ? { tone: "ok", label: "Połączone" }
          : { tone: "idle", label: "Niepołączone" };

  return (
    <IntegrationTile
      title="Akademia (Moodle)"
      description="Kursy, harmonogram szkoleń i terminy — w tym samym widoku kalendarza."
      icon={<GraduationCap className="w-6 h-6" aria-hidden="true" />}
      iconBg={
        connected
          ? "bg-green-500/10 text-green-500"
          : "bg-amber-500/10 text-amber-500"
      }
      connected={connected}
      status={statusLabel}
      configureLabel="Skonfiguruj"
      onConfigure={() => void connectAction.run()}
      onDisconnect={() => void disconnectAction.run()}
      configuring={connectAction.pending}
      disconnecting={disconnectAction.pending}
      canConfigure={hasRole && configured && reason !== "unreachable"}
      secondary={
        <>
          {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}

          {!configured && (
            <Alert tone="info" title="Integracja nieskonfigurowana">
              Administrator nie skonfigurował jeszcze Akademii. Skontaktuj się
              z osobą zarządzającą systemem.
            </Alert>
          )}
          {configured && !hasRole && (
            <Alert tone="info" title="Brak roli Akademii">
              Aby aktywować integrację, administrator musi przypisać Ci
              rolę Moodle (student / teacher / manager).
            </Alert>
          )}
          {reason === "not_provisioned" && hasRole && (
            <Alert tone="warning" title="Konto Akademii czeka na utworzenie">
              Pierwsze logowanie w Akademii utworzy Twoje konto — zaloguj
              się raz na https://akademia.myperformance.pl, a potem wróć tu
              i kliknij „Skonfiguruj&rdquo;.
            </Alert>
          )}
        </>
      }
    >
      <FeatureRow
        title="Terminy i przypomnienia kursów"
        desc="Wydarzenia Akademii pojawiają się w kalendarzu wraz z Google i grafiku pracy."
      />
      <FeatureRow
        title="Tworzenie własnych wydarzeń"
        desc='Dodaj wydarzenie oznaczone jako „Akademia" — trafi do Twojego kalendarza Moodle.'
      />
    </IntegrationTile>
  );
}

function FeatureRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Check className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-[var(--text-main)]">
            {title}
          </h4>
          <p className="text-xs text-[var(--text-muted)] mt-1">{desc}</p>
        </div>
      </div>
    </div>
  );
}
