"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Copy,
  Edit2,
  Key,
  Lock,
  Shield,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  Input,
  OnboardingCard,
  PasswordInput,
  useToast,
} from "@/components/ui";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { ApiRequestError } from "@/lib/api-client";

import { useAccount } from "../AccountProvider";
import { accountService } from "../account-service";
import type { WebAuthnKey } from "../types";

function formatDate(ms: number): string {
  if (!ms) return "Nieznana data";
  try {
    return new Date(ms).toLocaleDateString("pl-PL");
  } catch {
    return "Nieznana data";
  }
}

export function SecurityTab() {
  const {
    twoFA,
    webauthnKeys,
    profile,
    refetchProfile,
    refetchTwoFA,
    refetchWebAuthn,
  } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const requiredActions = profile?.requiredActions ?? [];
  const locks = (profile as { securityLocks?: { totp?: boolean; webauthn?: boolean } } | undefined)
    ?.securityLocks ?? { totp: false, webauthn: false };
  const totpAdminForced =
    requiredActions.includes("CONFIGURE_TOTP") || !!locks.totp;
  const webauthnAdminForced =
    requiredActions.includes("WEBAUTHN_REGISTER") || !!locks.webauthn;

  const [totpSetupOpen, setTotpSetupOpen] = useState(false);
  const [webauthnEnrollOpen, setWebauthnEnrollOpen] = useState(false);
  const [webauthnFeedback, setWebauthnFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);

  // Detect return from Keycloak webauthn-register flow. Może wrócić w 3 stanach:
  //   1. ?webauthn_done=1                 → success, refetch + success msg
  //   2. ?webauthn_done=1&error=...       → KC odrzucił flow (np. anulowane)
  //   3. brak parametrów (manual back)    → user opuścił flow bez akcji
  // Drugi i trzeci przypadek wcześniej milczał — teraz pokazujemy clear
  // feedback żeby user wiedział co się stało i mógł spróbować ponownie.
  useEffect(() => {
    const done = searchParams.get("webauthn_done");
    if (!done) return;
    const errorCode = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("webauthn_done");
    params.delete("error");
    params.delete("error_description");
    const qs = params.toString();
    router.replace(qs ? `/account?${qs}` : "/account?tab=security", {
      scroll: false,
    });
    void (async () => {
      await Promise.all([refetchWebAuthn(), refetchProfile()]);
      if (errorCode || errorDesc) {
        setWebauthnFeedback({
          tone: "error",
          message: `Rejestracja klucza nie powiodła się: ${decodeURIComponent(errorDesc ?? errorCode ?? "nieznany błąd")}. Spróbuj ponownie.`,
        });
      } else {
        setWebauthnFeedback({
          tone: "success",
          message: "Klucz bezpieczeństwa został zarejestrowany.",
        });
      }
    })();
  }, [searchParams, router, refetchWebAuthn, refetchProfile]);

  // Detect return from Keycloak CONFIGURE_TOTP flow — analogicznie z error
  // handling jak webauthn powyżej.
  useEffect(() => {
    const done = searchParams.get("totp_done");
    if (!done) return;
    const errorCode = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("totp_done");
    params.delete("error");
    params.delete("error_description");
    const qs = params.toString();
    router.replace(qs ? `/account?${qs}` : "/account?tab=security", {
      scroll: false,
    });
    void (async () => {
      await Promise.all([refetchTwoFA(), refetchProfile()]);
      if (errorCode || errorDesc) {
        setWebauthnFeedback({
          tone: "error",
          message: `Konfiguracja 2FA nie powiodła się: ${decodeURIComponent(errorDesc ?? errorCode ?? "nieznany błąd")}. Spróbuj ponownie.`,
        });
      }
    })();
  }, [searchParams, router, refetchTwoFA, refetchProfile]);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordAction = useAsyncAction(
    async (input: { currentPassword: string; newPassword: string }) => {
      await accountService.changePassword(input);
    },
    {
      resolveError: (err) =>
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zmienić hasła",
      onSuccess: () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast.success(
          "Hasło zmienione",
          "Nowe hasło zostało zapisane. Wyślemy też powiadomienie email.",
        );
      },
      onError: (err) => {
        const msg =
          err instanceof ApiRequestError
            ? err.message
            : "Sprawdź obecne hasło i spróbuj ponownie.";
        toast.error("Nie udało się zmienić hasła", msg);
      },
    },
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleChangePassword = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      setValidationError(null);
      passwordAction.reset();
      if (newPassword !== confirmPassword) {
        setValidationError("Hasła nie są identyczne");
        return;
      }
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        setValidationError(
          `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`,
        );
        return;
      }
      passwordAction.run({ currentPassword, newPassword });
    },
    [currentPassword, newPassword, confirmPassword, passwordAction],
  );

  const passwordSuccess = passwordAction.data !== null && !passwordAction.pending;
  const passwordError = validationError || passwordAction.error;

  const deleteTotpAction = useAsyncAction(
    async () => {
      await accountService.deleteTOTP();
    },
    {
      onSuccess: async () => {
        await refetchTwoFA();
        toast.success(
          "Aplikacja 2FA usunięta",
          "Wysłaliśmy email z potwierdzeniem na Twoje konto.",
        );
      },
      onError: (err) => {
        const msg =
          err instanceof ApiRequestError
            ? err.message
            : "Spróbuj ponownie za chwilę.";
        toast.error("Nie udało się usunąć aplikacji 2FA", msg);
      },
      resolveError: (err) =>
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się usunąć aplikacji uwierzytelniającej",
    },
  );

  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);
  const deleteKey = useCallback(
    async (key: WebAuthnKey) => {
      setDeletingKeyId(key.id);
      try {
        await accountService.deleteWebAuthnKey(key.credentialId || key.id);
        await refetchWebAuthn();
        toast.success(
          "Klucz usunięty",
          `Klucz „${key.label}" został usunięty z Twojego konta.`,
        );
      } catch (err) {
        const msg =
          err instanceof ApiRequestError
            ? err.message
            : "Spróbuj ponownie za chwilę.";
        toast.error("Nie udało się usunąć klucza", msg);
      } finally {
        setDeletingKeyId(null);
      }
    },
    [refetchWebAuthn, toast],
  );

  return (
    <div className="space-y-6">
      <OnboardingCard
        storageKey="account-security"
        title="Defense-in-depth: hasło + 2FA + WebAuthn"
      >
        Włącz przynajmniej jedną metodę 2FA — chroni Cię nawet po wycieku
        hasła. WebAuthn (klucz sprzętowy / Touch ID / Windows Hello) jest
        odporny na phishing. TOTP (Google Authenticator) działa offline.
        Krytyczne zmiany (hasło, dodanie urządzenia) wysyłają email niezależnie
        od preferencji.
      </OnboardingCard>

      {/* TOTP */}
      <Card padding="md">
        <CardHeader
          icon={<Smartphone className="w-6 h-6" aria-hidden="true" />}
          iconBgClassName={
            twoFA?.enabled
              ? "bg-green-500/10 text-green-500"
              : totpAdminForced
                ? "bg-red-500/10 text-red-500"
                : "bg-yellow-500/10 text-yellow-500"
          }
          title="Aplikacja uwierzytelniająca"
          description={
            twoFA?.enabled ? (
              <span className="text-green-500">Skonfigurowana</span>
            ) : totpAdminForced ? (
              <span className="text-red-500">
                Administrator wymaga konfiguracji
              </span>
            ) : (
              <span className="text-yellow-500">Nieskonfigurowana</span>
            )
          }
          action={
            !twoFA?.enabled ? (
              <Button onClick={() => setTotpSetupOpen(true)}>
                {totpAdminForced ? "Skonfiguruj" : "Włącz"}
              </Button>
            ) : undefined
          }
        />

        {twoFA?.enabled && (
          <div className="mt-6 p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--border-subtle)] flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Shield
                className="w-5 h-5 text-green-500 flex-shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-main)]">
                  Aplikacja uwierzytelniająca
                </p>
                <p className="text-xs text-[var(--text-muted)]">Status: Aktywna</p>
              </div>
            </div>
            {totpAdminForced ? (
              <Badge tone="neutral">
                <Lock className="w-3 h-3 mr-1" aria-hidden="true" />
                Wymuszone przez administratora
              </Badge>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Usuń aplikację uwierzytelniającą"
                loading={deleteTotpAction.pending}
                onClick={() => void deleteTotpAction.run()}
                className="text-red-500 hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}

        {deleteTotpAction.error && (
          <div className="mt-3">
            <Alert tone="error">{deleteTotpAction.error}</Alert>
          </div>
        )}
      </Card>

      {/* WebAuthn */}
      <Card padding="md">
        <CardHeader
          icon={<Key className="w-6 h-6" aria-hidden="true" />}
          iconBgClassName={
            webauthnKeys.length > 0
              ? "bg-green-500/10 text-green-500"
              : webauthnAdminForced
                ? "bg-red-500/10 text-red-500"
                : "bg-yellow-500/10 text-yellow-500"
          }
          title="Klucz bezpieczeństwa"
          description={
            webauthnKeys.length > 0 ? (
              <span className="text-green-500">
                {webauthnKeys.length}{" "}
                {webauthnKeys.length === 1 ? "klucz" : "klucze"} skonfigurowany
              </span>
            ) : webauthnAdminForced ? (
              <span className="text-red-500">
                Administrator wymaga konfiguracji
              </span>
            ) : (
              <span className="text-yellow-500">Nieskonfigurowany</span>
            )
          }
          action={
            webauthnKeys.length < 5 ? (
              <Button onClick={() => setWebauthnEnrollOpen(true)}>
                {webauthnKeys.length === 0
                  ? webauthnAdminForced
                    ? "Skonfiguruj"
                    : "Włącz"
                  : "Dodaj klucz"}
              </Button>
            ) : undefined
          }
        />

        {webauthnFeedback && (
          <div className="mt-3">
            <Alert tone={webauthnFeedback.tone}>
              {webauthnFeedback.message}
            </Alert>
          </div>
        )}

        {webauthnKeys.length > 0 && (
          <div className="mt-6 space-y-3">
            {webauthnKeys.map((key) => (
              <WebAuthnKeyRow
                key={key.id}
                keyData={key}
                adminForced={webauthnAdminForced}
                deleting={deletingKeyId === key.id}
                onDelete={() => void deleteKey(key)}
                onRenamed={() => void refetchWebAuthn()}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Password change */}
      <Card padding="md">
        <CardHeader
          icon={<Key className="w-6 h-6 text-[var(--accent)]" aria-hidden="true" />}
          title="Zmiana hasła"
          description="Zmień hasło dostępu do konta"
        />
        <div className="mt-6">
          {passwordSuccess && (
            <div className="mb-4">
              <Alert tone="success">
                <span className="inline-flex items-center gap-2">
                  <Check className="w-4 h-4" aria-hidden="true" />
                  Hasło zostało zmienione pomyślnie
                </span>
              </Alert>
            </div>
          )}
          {passwordError && (
            <div className="mb-4">
              <Alert tone="error">{passwordError}</Alert>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <PasswordInput
              placeholder="Aktualne hasło"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              disabled={passwordAction.pending}
            />
            <PasswordInput
              placeholder="Nowe hasło"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={passwordAction.pending}
              hint={`Minimum ${MIN_PASSWORD_LENGTH} znaków`}
            />
            <Input
              type="password"
              placeholder="Potwierdź nowe hasło"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={passwordAction.pending}
            />
            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={passwordAction.pending}
              disabled={!currentPassword || !newPassword || !confirmPassword}
            >
              Zmień hasło
            </Button>
          </form>
        </div>
      </Card>

      <TotpSetupDialog
        open={totpSetupOpen}
        onClose={() => setTotpSetupOpen(false)}
        onSuccess={async () => {
          setTotpSetupOpen(false);
          await Promise.all([refetchTwoFA(), refetchProfile()]);
        }}
      />

      <WebAuthnEnrollDialog
        open={webauthnEnrollOpen}
        onClose={() => setWebauthnEnrollOpen(false)}
      />
    </div>
  );
}

function WebAuthnKeyRow({
  keyData,
  adminForced,
  deleting,
  onDelete,
  onRenamed,
}: {
  keyData: WebAuthnKey;
  adminForced: boolean;
  deleting: boolean;
  onDelete: () => void;
  onRenamed: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(keyData.label);

  const renameAction = useAsyncAction(
    async (value: string) => {
      await accountService.renameWebAuthnKey({
        credentialId: keyData.credentialId || keyData.id,
        newName: value,
      });
    },
    {
      onSuccess: () => {
        setRenaming(false);
        onRenamed();
      },
    },
  );

  const submitRename = () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === keyData.label) {
      setRenaming(false);
      return;
    }
    renameAction.run(trimmed);
  };

  return (
    <div className="p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--border-subtle)] flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Key
          className="w-5 h-5 text-green-500 flex-shrink-0"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          {renaming ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                aria-label="Nowa nazwa klucza"
                className="flex-1 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--accent)] rounded-lg text-sm text-[var(--text-main)] focus:outline-none"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Zapisz nazwę"
                loading={renameAction.pending}
                onClick={submitRename}
              >
                <Check className="w-4 h-4 text-green-500" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Anuluj"
                onClick={() => setRenaming(false)}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-[var(--text-main)] truncate">
                {keyData.label}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Dodano: {formatDate(keyData.createdDate)}
              </p>
            </>
          )}
        </div>
      </div>
      {!renaming && (
        <div className="flex gap-1 items-center flex-shrink-0">
          {adminForced ? (
            <Badge tone="neutral">
              <Lock className="w-3 h-3 mr-1" aria-hidden="true" />
              Wymuszone przez administratora
            </Badge>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Zmień nazwę"
                onClick={() => {
                  setRenameValue(keyData.label);
                  setRenaming(true);
                }}
              >
                <Edit2 className="w-4 h-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Usuń klucz"
                loading={deleting}
                onClick={onDelete}
                className="text-red-500 hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TotpSetupDialog({
  open,
  onClose,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onSuccess: _onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const id = useId();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStarting(false);
      setError(null);
    }
  }, [open]);

  // KC native flow: redirect do /authorize z kc_action=CONFIGURE_TOTP + prompt=login.
  // KC sam pokaże QR, zweryfikuje kod i zapisze credential w prawidłowym
  // formacie (manual PUT user.credentials wsadza JSON który KC nie traktuje
  // jako enabled — credential nie jest używany przy login).
  // Po powrocie z KC: callback ?totp_done=1 → refetchTwoFA w parent.
  const startKcFlow = () => {
    setError(null);
    setStarting(true);
    try {
      const callbackUrl = "/account?tab=security&totp_done=1";
      void signIn(
        "keycloak",
        { callbackUrl, redirect: true },
        { kc_action: "CONFIGURE_TOTP", prompt: "login" },
      );
    } catch (err) {
      setStarting(false);
      setError(
        err instanceof Error
          ? err.message
          : "Nie udało się uruchomić konfiguracji 2FA",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Konfiguracja aplikacji uwierzytelniającej"
      labelledById={id}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-main)]/85 leading-relaxed">
          Skonfigurujemy aplikację 2FA przez Keycloak — zostaniesz przeniesiony
          do bezpiecznego ekranu, gdzie zeskanujesz kod QR aplikacją (Google
          Authenticator, Authy, 1Password) i wpiszesz wygenerowany kod. Po
          zatwierdzeniu wrócisz tutaj.
        </p>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] p-3 text-xs text-[var(--text-main)]/75">
          Dlaczego natywny flow? Keycloak generuje credential w prawidłowym
          formacie i od razu wymusza go przy kolejnych logowaniach. Nasz wcześniejszy
          custom flow wstawiał credential ale KC go nie używał.
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={starting}
            className="flex-1"
          >
            Anuluj
          </Button>
          <Button
            type="button"
            onClick={startKcFlow}
            loading={starting}
            className="flex-1"
          >
            Skonfiguruj przez Keycloak
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

type AttachmentChoice = "platform" | "cross-platform";

function WebAuthnEnrollDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const id = useId();
  const [attachment, setAttachment] = useState<AttachmentChoice | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = "Rejestracja klucza bezpieczeństwa";

  useEffect(() => {
    if (!open) {
      setAttachment(null);
      setStarting(false);
      setError(null);
    }
  }, [open]);

  // Keycloak's WebAuthn flow is the only one that produces credentials the
  // server actually accepts (admin-API inserts end up with broken CBOR/COSE
  // encoding, hence the 503 "Keycloak odrzucił credential"). We redirect
  // into the login flow with kc_action so KC handles navigator.credentials
  // natively and stores the credential through its own WebAuthnCredentialProvider.
  //
  // - platform   → webauthn-register-passwordless (passkey, resident key)
  // - cross-platform → webauthn-register (2FA security key)
  const startKcFlow = (choice: AttachmentChoice) => {
    setError(null);
    setStarting(true);
    try {
      const kcAction =
        choice === "platform"
          ? "webauthn-register-passwordless"
          : "webauthn-register";
      // Preserve tab state on return; ?webauthn_done=1 triggers refetch.
      const callbackUrl = "/account?tab=security&webauthn_done=1";
      // prompt=login wymusza re-authenticate w KC nawet jeśli user ma
      // aktywną sesję, w przeciwnym razie KC może zignorować kc_action
      // i wrócić bez wykonania flow rejestracji.
      void signIn(
        "keycloak",
        { callbackUrl, redirect: true },
        { kc_action: kcAction, prompt: "login" },
      );
    } catch (err) {
      setStarting(false);
      setError(
        err instanceof Error
          ? err.message
          : "Nie udało się uruchomić rejestracji klucza",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      labelledById={id}
      size="md"
    >
      {attachment === null ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Wybierz rodzaj klucza. Biometria loguje Cię jednym gestem (Touch ID,
            Windows Hello, klucz Android). Klucz sprzętowy wymaga fizycznego
            urządzenia USB/NFC (np. YubiKey).
          </p>
          <button
            type="button"
            onClick={() => setAttachment("platform")}
            className="w-full text-left p-4 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 hover:bg-[var(--bg-main)] transition-colors"
          >
            <p className="text-sm font-semibold text-[var(--text-main)]">
              Biometria / Passkey
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Touch ID, Face ID, Windows Hello — najwygodniejsza opcja na
              prywatnym laptopie lub telefonie.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setAttachment("cross-platform")}
            className="w-full text-left p-4 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 hover:bg-[var(--bg-main)] transition-colors"
          >
            <p className="text-sm font-semibold text-[var(--text-main)]">
              Klucz sprzętowy
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Przenośny klucz USB / NFC (YubiKey, Titan, SoloKey).
            </p>
          </button>
          <div className="flex justify-end pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Anuluj
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert tone="info">
            Zostaniesz przeniesiony na stronę logowania Keycloak, która obsłuży
            rejestrację klucza natywnie (przeglądarka poprosi o biometrię lub
            klucz sprzętowy). Po rejestracji wrócisz automatycznie tutaj.
          </Alert>
          <p className="text-sm text-[var(--text-muted)]">
            {attachment === "platform"
              ? "Po przekierowaniu potwierdź rejestrację biometrią (Touch ID, Face ID, Windows Hello)."
              : "Po przekierowaniu podłącz klucz sprzętowy przez USB lub przyłóż NFC — przeglądarka poprosi o potwierdzenie."}
          </p>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAttachment(null)}
              disabled={starting}
              className="flex-1"
            >
              Wstecz
            </Button>
            <Button
              type="button"
              loading={starting}
              onClick={() => startKcFlow(attachment)}
              className="flex-1"
            >
              Kontynuuj w Keycloak
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
