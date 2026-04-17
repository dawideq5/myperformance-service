"use client";

import { useState } from "react";
import {
  Smartphone, Key, Shield, AlertCircle, Check, Clock,
  ChevronRight, Loader2, LogOut, X, Eye, EyeOff, Edit2, Info,
} from "lucide-react";
import type { TwoFAStatus } from "@/app/account/types";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

interface WebAuthnKey {
  id: string;
  credentialId?: string;
  label: string;
  createdDate: number;
}

interface Props {
  twoFA: TwoFAStatus | null;
  pending2FA: boolean;
  pendingWebAuthn: boolean;
  webauthnKeys: WebAuthnKey[];
  setWebauthnKeys: (keys: WebAuthnKey[]) => void;
  configuringMethod: string | null;
  onSetRequiredAction: (action: string, method: string) => void;
  onCancelRequiredAction: (action: string) => void;
  onSignOutWithKeycloak: () => void;
}

export function SecurityTab({
  twoFA, pending2FA, pendingWebAuthn, webauthnKeys, setWebauthnKeys,
  configuringMethod, onSetRequiredAction, onCancelRequiredAction, onSignOutWithKeycloak,
}: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [renamingKeyId, setRenamingKeyId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Hasła nie są identyczne");
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`);
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPasswordError(data.error?.message || data.error || "Nie udało się zmienić hasła");
      } else {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordError("Wystąpił błąd podczas zmiany hasła");
    } finally {
      setChangingPassword(false);
    }
  };

  const startRenameKey = (key: WebAuthnKey) => {
    setRenamingKeyId(key.id);
    setRenameValue(key.label);
  };

  const submitRenameKey = async (key: WebAuthnKey) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === key.label) {
      setRenamingKeyId(null);
      return;
    }

    try {
      const res = await fetch("/api/account/webauthn", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: key.credentialId || key.id, newName: trimmed }),
      });

      if (res.ok) {
        const keysRes = await fetch("/api/account/webauthn");
        if (keysRes.ok) {
          const keysData = await keysRes.json();
          setWebauthnKeys(keysData.keys || []);
        }
      }
    } catch {
      // Non-fatal — keep existing label
    } finally {
      setRenamingKeyId(null);
    }
  };

  return (
    <div className="space-y-6 animate-tab-in">
      {/* 2FA Section */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${twoFA?.enabled ? "bg-green-500/10" : pending2FA ? "bg-blue-500/10" : "bg-yellow-500/10"}`}>
              <Smartphone className={`w-6 h-6 ${twoFA?.enabled ? "text-green-500" : pending2FA ? "text-blue-500" : "text-yellow-500"}`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-main)]">Aplikacja uwierzytelniająca</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {twoFA?.enabled ? (
                  <span className="text-green-500">Skonfigurowana</span>
                ) : pending2FA ? (
                  <span className="text-blue-500">Oczekuje konfiguracji przy logowaniu</span>
                ) : (
                  <span className="text-yellow-500">Nieskonfigurowana</span>
                )}
              </p>
            </div>
          </div>
          {!twoFA?.enabled && !pending2FA && (
            <button
              onClick={() => onSetRequiredAction("CONFIGURE_TOTP", "2FA")}
              disabled={configuringMethod === "2FA"}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50"
            >
              {configuringMethod === "2FA" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Włącz
            </button>
          )}
          {pending2FA && (
            <div className="flex items-center gap-2 text-sm text-blue-500">
              <Clock className="w-4 h-4" />
              <span>Gotowe do konfiguracji</span>
            </div>
          )}
        </div>

        {pending2FA && (
          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-sm text-blue-400 mb-3">
              Aplikacja uwierzytelniająca zostanie skonfigurowana przy następnym logowaniu. Wyloguj się i zaloguj ponownie, aby dokończyć konfigurację.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onSignOutWithKeycloak}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Wyloguj się teraz
              </button>
              <button
                onClick={() => onCancelRequiredAction("CONFIGURE_TOTP")}
                className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-lg text-sm font-medium hover:bg-[var(--bg-main)] transition-colors"
              >
                <X className="w-4 h-4" />
                Anuluj
              </button>
            </div>
          </div>
        )}

        {twoFA?.enabled && (
          <div className="mt-6 p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--border-subtle)]">
            <div className="flex items-center gap-3 mb-3">
              <Shield className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm font-medium text-[var(--text-main)]">Aplikacja uwierzytelniająca</p>
                <p className="text-xs text-[var(--text-muted)]">Status: Aktywna</p>
              </div>
            </div>
            <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
              <p className="text-xs text-blue-400">
                <strong>Informacja:</strong> W celu usunięcia aplikacji uwierzytelniającej skontaktuj się z administratorem systemu.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* WebAuthn Section */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${webauthnKeys.length > 0 ? "bg-green-500/10" : pendingWebAuthn ? "bg-blue-500/10" : "bg-yellow-500/10"}`}>
              <Key className={`w-6 h-6 ${webauthnKeys.length > 0 ? "text-green-500" : pendingWebAuthn ? "text-blue-500" : "text-yellow-500"}`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-main)]">Klucz bezpieczeństwa</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {webauthnKeys.length > 0 ? (
                  <span className="text-green-500">{webauthnKeys.length} klucz(y) skonfigurowany(ch)</span>
                ) : pendingWebAuthn ? (
                  <span className="text-blue-500">Oczekuje konfiguracji przy logowaniu</span>
                ) : (
                  <span className="text-yellow-500">Nieskonfigurowany</span>
                )}
              </p>
            </div>
          </div>
          {webauthnKeys.length < 2 && !pendingWebAuthn && (
            <button
              onClick={() => onSetRequiredAction("WEBAUTHN_REGISTER", "WebAuthn")}
              disabled={configuringMethod === "WebAuthn"}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {configuringMethod === "WebAuthn" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {webauthnKeys.length === 0 ? "Włącz" : "Dodaj drugi klucz"}
            </button>
          )}
          {webauthnKeys.length >= 2 && (
            <span className="text-xs text-[var(--text-muted)] px-3 py-1 bg-[var(--bg-main)] rounded-lg border border-[var(--border-subtle)]">
              Maks. 2 klucze
            </span>
          )}
          {pendingWebAuthn && (
            <div className="flex items-center gap-2 text-sm text-blue-500">
              <Clock className="w-4 h-4" />
              <span>Gotowe do konfiguracji</span>
            </div>
          )}
        </div>

        {pendingWebAuthn && (
          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-sm text-blue-400 mb-3">
              Klucz bezpieczeństwa zostanie skonfigurowany przy następnym logowaniu. Wyloguj się i zaloguj ponownie, aby dokończyć konfigurację.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onSignOutWithKeycloak}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Wyloguj się teraz
              </button>
              <button
                onClick={() => onCancelRequiredAction("WEBAUTHN_REGISTER")}
                className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-lg text-sm font-medium hover:bg-[var(--bg-main)] transition-colors"
              >
                <X className="w-4 h-4" />
                Anuluj
              </button>
            </div>
          </div>
        )}

        {webauthnKeys.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-medium text-[var(--text-main)] mb-3">Zarejestrowane klucze</h3>
            {webauthnKeys.map((key) => (
              <div key={key.id} className="p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--border-subtle)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Key className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      {renamingKeyId === key.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") submitRenameKey(key);
                              if (e.key === "Escape") setRenamingKeyId(null);
                            }}
                            className="flex-1 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--accent)] rounded-lg text-sm text-[var(--text-main)] focus:outline-none"
                          />
                          <button
                            onClick={() => submitRenameKey(key)}
                            className="p-1.5 text-green-500 hover:bg-green-500/10 rounded-lg transition-colors"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setRenamingKeyId(null)}
                            className="p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-[var(--text-main)] truncate">{key.label}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            Dodano: {key.createdDate ? new Date(key.createdDate).toLocaleDateString("pl-PL") : "Nieznana data"}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  {renamingKeyId !== key.id && (
                    <button
                      onClick={() => startRenameKey(key)}
                      className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] rounded-lg transition-colors flex-shrink-0"
                      title="Edytuj nazwę"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                  <p className="text-xs text-blue-400">
                    <strong>Informacja:</strong> W celu usunięcia klucza bezpieczeństwa skontaktuj się z administratorem systemu.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Password Change */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
            <Key className="w-6 h-6 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Zmiana hasła</h2>
            <p className="text-sm text-[var(--text-muted)]">Zmień hasło dostępu do konta</p>
          </div>
        </div>

        {passwordSuccess && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-2 text-sm text-green-500">
            <Check className="w-4 h-4" />
            Hasło zostało zmienione pomyślnie
          </div>
        )}

        {passwordError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-sm text-red-500">
            <AlertCircle className="w-4 h-4" />
            {passwordError}
          </div>
        )}

        <form onSubmit={changePassword} className="space-y-4">
          <div className="relative">
            <input
              type={showCurrentPassword ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Aktualne hasło"
              className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)]"
            >
              {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="relative">
            <input
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nowe hasło"
              className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)]"
            >
              {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Potwierdź nowe hasło"
            className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />

          <button
            type="submit"
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50"
          >
            {changingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
            Zmień hasło
          </button>
        </form>
      </div>
    </div>
  );
}
