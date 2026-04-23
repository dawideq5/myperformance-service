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
  PasswordInput,
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

  const requiredActions = profile?.requiredActions ?? [];
  const totpAdminForced = requiredActions.includes("CONFIGURE_TOTP");
  const webauthnAdminForced = requiredActions.includes("WEBAUTHN_REGISTER");

  const [totpSetupOpen, setTotpSetupOpen] = useState(false);
  const [webauthnEnrollOpen, setWebauthnEnrollOpen] = useState(false);
  const [webauthnFeedback, setWebauthnFeedback] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);

  // Detect return from Keycloak webauthn-register flow (via kc_action). KC
  // redirects back with our callbackUrl untouched — we tag that URL with
  // ?webauthn_done=1, then refresh the keys list and clear the query param.
  useEffect(() => {
    const done = searchParams.get("webauthn_done");
    if (!done) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("webauthn_done");
    const qs = params.toString();
    router.replace(qs ? `/account?${qs}` : "/account?tab=security", {
      scroll: false,
    });
    void (async () => {
      await Promise.all([refetchWebAuthn(), refetchProfile()]);
      setWebauthnFeedback({
        tone: "success",
        message: "Klucz bezpieczeństwa został zarejestrowany.",
      });
    })();
  }, [searchParams, router, refetchWebAuthn, refetchProfile]);

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
      } finally {
        setDeletingKeyId(null);
      }
    },
    [refetchWebAuthn],
  );

  return (
    <div className="space-y-6">
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
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const id = useId();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const generateAction = useAsyncAction(
    async () => accountService.generateTOTP(),
    {
      onSuccess: (r) => {
        setQr(r.qrCode);
        setSecret(r.secret);
      },
    },
  );

  const verifyAction = useAsyncAction(
    async (input: { secret: string; totpCode: string }) =>
      accountService.verifyTOTP(input),
    {
      onSuccess: () => {
        void onSuccess();
      },
      resolveError: (err) =>
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zweryfikować kodu",
    },
  );

  useEffect(() => {
    if (!open) {
      setQr(null);
      setSecret(null);
      setCode("");
      setCopied(false);
      generateAction.reset();
      verifyAction.reset();
      return;
    }
    if (!qr) void generateAction.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!secret || code.trim().length < 6) return;
    void verifyAction.run({ secret, totpCode: code.trim() });
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
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
      {generateAction.pending && !qr ? (
        <p className="text-sm text-[var(--text-muted)]">Generowanie kodu QR…</p>
      ) : generateAction.error ? (
        <Alert tone="error">{generateAction.error}</Alert>
      ) : (
        qr &&
        secret && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              Zeskanuj kod QR aplikacją (Google Authenticator, Authy, 1Password)
              lub wpisz sekret ręcznie, a następnie podaj wygenerowany 6-cyfrowy
              kod poniżej.
            </p>
            <div className="flex flex-col items-center gap-3 py-2">
              <img
                src={qr}
                alt="Kod QR do skanowania"
                width={200}
                height={200}
                className="rounded-xl border border-[var(--border-subtle)] bg-white p-2"
              />
              <div className="flex items-center gap-2 text-xs">
                <code className="px-2 py-1 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded font-mono break-all">
                  {secret}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Kopiuj sekret"
                  onClick={copySecret}
                >
                  {copied ? (
                    <Check
                      className="w-4 h-4 text-green-500"
                      aria-hidden="true"
                    />
                  ) : (
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
            <Input
              label="Kod weryfikacyjny"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              disabled={verifyAction.pending}
            />
            {verifyAction.error && <Alert tone="error">{verifyAction.error}</Alert>}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={verifyAction.pending}
                className="flex-1"
              >
                Anuluj
              </Button>
              <Button
                type="submit"
                loading={verifyAction.pending}
                disabled={code.length !== 6}
                className="flex-1"
              >
                Aktywuj
              </Button>
            </div>
          </form>
        )
      )}
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
      void signIn(
        "keycloak",
        { callbackUrl, redirect: true },
        { kc_action: kcAction },
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
