"use client";

import { useCallback, useState, type FormEvent } from "react";
import {
  Check,
  ChevronRight,
  Clock,
  Edit2,
  Key,
  LogOut,
  Shield,
  Smartphone,
  X,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PasswordInput,
} from "@/components/ui";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { ApiRequestError } from "@/lib/api-client";

import { useAccount } from "../AccountProvider";
import { accountService } from "../account-service";
import type { RequiredAction, WebAuthnKey } from "../types";

const METHOD_2FA = "CONFIGURE_TOTP";
const METHOD_WEBAUTHN = "WEBAUTHN_REGISTER";

function formatDate(ms: number): string {
  if (!ms) return "Nieznana data";
  try {
    return new Date(ms).toLocaleDateString("pl-PL");
  } catch {
    return "Nieznana data";
  }
}

export function SecurityTab() {
  const { twoFA, webauthnKeys, profile, refetchProfile, refetchWebAuthn } =
    useAccount();
  const { fullLogout } = useAuthRedirect();

  const requiredActions = profile?.requiredActions ?? [];
  const pending2FA = requiredActions.includes("CONFIGURE_TOTP");
  const pendingWebAuthn = requiredActions.includes("WEBAUTHN_REGISTER");

  const setAction = useAsyncAction(
    async (action: RequiredAction) => {
      await accountService.setRequiredAction(action);
      await refetchProfile();
    },
  );
  const cancelAction = useAsyncAction(
    async (action: RequiredAction) => {
      await accountService.cancelRequiredAction(action);
      await refetchProfile();
    },
  );

  // Track which method is currently being set to drive per-button spinners.
  const [activeMethod, setActiveMethod] = useState<string | null>(null);
  const triggerRequiredAction = useCallback(
    async (action: RequiredAction, method: string) => {
      setActiveMethod(method);
      try {
        await setAction.run(action);
      } finally {
        setActiveMethod(null);
      }
    },
    [setAction],
  );

  // --- Password change ---
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

  // --- WebAuthn rename ---
  const [renamingKeyId, setRenamingKeyId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = useCallback((key: WebAuthnKey) => {
    setRenamingKeyId(key.id);
    setRenameValue(key.label);
  }, []);

  const renameAction = useAsyncAction(
    async (input: { key: WebAuthnKey; value: string }) => {
      await accountService.renameWebAuthnKey({
        credentialId: input.key.credentialId || input.key.id,
        newName: input.value,
      });
      await refetchWebAuthn();
    },
    { onSuccess: () => setRenamingKeyId(null) },
  );

  const submitRename = useCallback(
    (key: WebAuthnKey) => {
      const trimmed = renameValue.trim();
      if (!trimmed || trimmed === key.label) {
        setRenamingKeyId(null);
        return;
      }
      renameAction.run({ key, value: trimmed });
    },
    [renameAction, renameValue],
  );

  const passwordSuccess = passwordAction.data !== null && !passwordAction.pending;
  const passwordError = validationError || passwordAction.error;

  return (
    <div className="space-y-6">
      {/* 2FA */}
      <Card padding="md">
        <CardHeader
          icon={<Smartphone className="w-6 h-6" aria-hidden="true" />}
          iconBgClassName={
            twoFA?.enabled
              ? "bg-green-500/10 text-green-500"
              : pending2FA
                ? "bg-blue-500/10 text-blue-500"
                : "bg-yellow-500/10 text-yellow-500"
          }
          title="Aplikacja uwierzytelniająca"
          description={
            twoFA?.enabled ? (
              <span className="text-green-500">Skonfigurowana</span>
            ) : pending2FA ? (
              <span className="text-blue-500">
                Oczekuje konfiguracji przy logowaniu
              </span>
            ) : (
              <span className="text-yellow-500">Nieskonfigurowana</span>
            )
          }
          action={
            !twoFA?.enabled && !pending2FA ? (
              <Button
                loading={activeMethod === "2FA"}
                rightIcon={
                  activeMethod !== "2FA" && (
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  )
                }
                onClick={() => void triggerRequiredAction(METHOD_2FA, "2FA")}
              >
                Włącz
              </Button>
            ) : pending2FA ? (
              <Badge tone="info">
                <Clock className="w-3 h-3 mr-1" aria-hidden="true" />
                Gotowe do konfiguracji
              </Badge>
            ) : undefined
          }
        />

        {pending2FA && (
          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-sm text-blue-400 mb-3">
              Aplikacja uwierzytelniająca zostanie skonfigurowana przy
              następnym logowaniu. Wyloguj się i zaloguj ponownie, aby
              dokończyć konfigurację.
            </p>
            <div className="flex gap-3">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<LogOut className="w-4 h-4" aria-hidden="true" />}
                onClick={() => void fullLogout()}
              >
                Wyloguj się teraz
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<X className="w-4 h-4" aria-hidden="true" />}
                loading={cancelAction.pending}
                onClick={() => void cancelAction.run(METHOD_2FA)}
              >
                Anuluj
              </Button>
            </div>
          </div>
        )}

        {twoFA?.enabled && (
          <div className="mt-6 p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--border-subtle)]">
            <div className="flex items-center gap-3 mb-3">
              <Shield className="w-5 h-5 text-green-500" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-[var(--text-main)]">
                  Aplikacja uwierzytelniająca
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Status: Aktywna
                </p>
              </div>
            </div>
            <Alert tone="info">
              W celu usunięcia aplikacji uwierzytelniającej skontaktuj się z
              administratorem systemu.
            </Alert>
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
              : pendingWebAuthn
                ? "bg-blue-500/10 text-blue-500"
                : "bg-yellow-500/10 text-yellow-500"
          }
          title="Klucz bezpieczeństwa"
          description={
            webauthnKeys.length > 0 ? (
              <span className="text-green-500">
                {webauthnKeys.length} klucz(y) skonfigurowany(ch)
              </span>
            ) : pendingWebAuthn ? (
              <span className="text-blue-500">
                Oczekuje konfiguracji przy logowaniu
              </span>
            ) : (
              <span className="text-yellow-500">Nieskonfigurowany</span>
            )
          }
          action={
            webauthnKeys.length < 2 && !pendingWebAuthn ? (
              <Button
                loading={activeMethod === "WebAuthn"}
                rightIcon={
                  activeMethod !== "WebAuthn" && (
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  )
                }
                onClick={() =>
                  void triggerRequiredAction(METHOD_WEBAUTHN, "WebAuthn")
                }
              >
                {webauthnKeys.length === 0 ? "Włącz" : "Dodaj drugi klucz"}
              </Button>
            ) : webauthnKeys.length >= 2 ? (
              <Badge tone="neutral">Maks. 2 klucze</Badge>
            ) : pendingWebAuthn ? (
              <Badge tone="info">
                <Clock className="w-3 h-3 mr-1" aria-hidden="true" />
                Gotowe
              </Badge>
            ) : undefined
          }
        />

        {pendingWebAuthn && (
          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-sm text-blue-400 mb-3">
              Klucz bezpieczeństwa zostanie skonfigurowany przy następnym
              logowaniu. Wyloguj się i zaloguj ponownie, aby dokończyć
              konfigurację.
            </p>
            <div className="flex gap-3">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<LogOut className="w-4 h-4" aria-hidden="true" />}
                onClick={() => void fullLogout()}
              >
                Wyloguj się teraz
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<X className="w-4 h-4" aria-hidden="true" />}
                loading={cancelAction.pending}
                onClick={() => void cancelAction.run(METHOD_WEBAUTHN)}
              >
                Anuluj
              </Button>
            </div>
          </div>
        )}

        {webauthnKeys.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-medium text-[var(--text-main)] mb-3">
              Zarejestrowane klucze
            </h3>
            {webauthnKeys.map((key) => (
              <div
                key={key.id}
                className="p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--border-subtle)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Key
                      className="w-5 h-5 text-green-500 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      {renamingKeyId === key.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") submitRename(key);
                              if (e.key === "Escape") setRenamingKeyId(null);
                            }}
                            aria-label="Nowa nazwa klucza"
                            className="flex-1 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--accent)] rounded-lg text-sm text-[var(--text-main)] focus:outline-none"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Zapisz nazwę"
                            loading={renameAction.pending}
                            onClick={() => submitRename(key)}
                          >
                            <Check
                              className="w-4 h-4 text-green-500"
                              aria-hidden="true"
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Anuluj zmianę nazwy"
                            onClick={() => setRenamingKeyId(null)}
                          >
                            <X className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-[var(--text-main)] truncate">
                            {key.label}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            Dodano: {formatDate(key.createdDate)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  {renamingKeyId !== key.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edytuj nazwę klucza"
                      onClick={() => startRename(key)}
                    >
                      <Edit2 className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <div className="mt-3">
                  <Alert tone="info">
                    W celu usunięcia klucza bezpieczeństwa skontaktuj się z
                    administratorem systemu.
                  </Alert>
                </div>
              </div>
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
    </div>
  );
}
