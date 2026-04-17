"use client";

import type { FormEvent } from "react";
import {
  User, Mail, Smartphone, Check, Loader2, ChevronRight,
  ShieldCheck, Clock, X,
} from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import type { UserProfile } from "@/app/account/types";

interface Props {
  profile: UserProfile | null;
  editingProfile: boolean;
  editFirstName: string;
  editLastName: string;
  editEmail: string;
  editPhoneNumber: string;
  editPhonePrefix: string;
  setEditFirstName: (v: string) => void;
  setEditLastName: (v: string) => void;
  setEditEmail: (v: string) => void;
  setEditPhoneNumber: (v: string) => void;
  setEditPhonePrefix: (v: string) => void;
  savingProfile: boolean;
  profileSuccess: boolean;
  pendingEmailVerify: boolean;
  configuringMethod: string | null;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSaveProfile: (e: FormEvent) => void;
  onSetRequiredAction: (action: string, method: string) => void;
  onCancelRequiredAction: (action: string) => void;
}

export function ProfileTab({
  profile, editingProfile,
  editFirstName, editLastName, editEmail, editPhoneNumber, editPhonePrefix,
  setEditFirstName, setEditLastName, setEditEmail, setEditPhoneNumber, setEditPhonePrefix,
  savingProfile, profileSuccess, pendingEmailVerify, configuringMethod,
  onStartEditing, onCancelEditing, onSaveProfile, onSetRequiredAction, onCancelRequiredAction,
}: Props) {
  const { theme } = useTheme();

  return (
    <div className="space-y-6 animate-tab-in">
      {/* Personal info card */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Dane osobowe</h2>
          {!editingProfile && (
            <button
              onClick={onStartEditing}
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Edytuj
            </button>
          )}
        </div>

        {profileSuccess && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-2 text-sm text-green-500">
            <Check className="w-4 h-4" />
            Dane zostały zapisane
          </div>
        )}

        {editingProfile ? (
          <form onSubmit={onSaveProfile} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Imię</label>
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Nazwisko</label>
                <input
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-2">Email</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-2">Numer telefonu</label>
              <PhoneInput
                value={editPhoneNumber}
                prefix={editPhonePrefix}
                onChange={setEditPhoneNumber}
                onPrefixChange={setEditPhonePrefix}
                disabled={savingProfile}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50"
              >
                {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                Zapisz
              </button>
              <button
                type="button"
                onClick={onCancelEditing}
                className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-xl text-sm font-medium hover:text-[var(--text-main)] transition-colors"
              >
                Anuluj
              </button>
            </div>
          </form>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { label: "Imię", value: profile?.firstName },
              { label: "Nazwisko", value: profile?.lastName },
              { label: "Nazwa użytkownika", value: profile?.username, muted: true },
            ].map(({ label, value, muted }) => (
              <div key={label}>
                <label className="block text-sm text-[var(--text-muted)] mb-2">{label}</label>
                <div className={`px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl ${muted ? "text-[var(--text-muted)]" : "text-[var(--text-main)]"}`}>
                  {value || "-"}
                </div>
              </div>
            ))}
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-2">Email</label>
              <div className="flex items-center gap-2 px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)]">
                <Mail className="w-4 h-4 text-[var(--text-muted)]" />
                {profile?.email || "-"}
                {profile?.emailVerified && (
                  <ShieldCheck className="w-4 h-4 text-green-500 ml-auto" />
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-2">Numer telefonu</label>
              <div className="flex items-center gap-2 px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)]">
                <Smartphone className="w-4 h-4 text-[var(--text-muted)]" />
                {profile?.attributes?.["phone-number"]?.[0] || "-"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Email verification */}
      {(!profile?.emailVerified || pendingEmailVerify) && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${profile?.emailVerified ? "bg-green-500/10" : pendingEmailVerify ? "bg-blue-500/10" : "bg-yellow-500/10"}`}>
                <Mail className={`w-6 h-6 ${profile?.emailVerified ? "text-green-500" : pendingEmailVerify ? "text-blue-500" : "text-yellow-500"}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-main)]">Weryfikacja adresu email</h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {profile?.emailVerified ? (
                    <span className="text-green-500">Zweryfikowany</span>
                  ) : pendingEmailVerify ? (
                    <span className="text-blue-500">Link weryfikacyjny wysłany</span>
                  ) : (
                    <span className="text-yellow-500">Wymaga weryfikacji</span>
                  )}
                </p>
              </div>
            </div>
            {!profile?.emailVerified && !pendingEmailVerify && (
              <button
                onClick={() => onSetRequiredAction("VERIFY_EMAIL", "EmailVerify")}
                disabled={configuringMethod === "EmailVerify"}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50"
              >
                {configuringMethod === "EmailVerify" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                Zweryfikuj
              </button>
            )}
            {pendingEmailVerify && (
              <div className="flex items-center gap-2 text-sm text-blue-500">
                <Clock className="w-4 h-4" />
                <span>Oczekuje na weryfikację</span>
              </div>
            )}
          </div>
          {pendingEmailVerify && (
            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <p className="text-sm text-blue-400 mb-3">
                Na Twój adres email został wysłany link weryfikacyjny. Kliknij w link zawarty w wiadomości, aby potwierdzić własność adresu email.
              </p>
              <button
                onClick={() => onCancelRequiredAction("VERIFY_EMAIL")}
                className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-lg text-sm font-medium hover:bg-[var(--bg-main)] transition-colors"
              >
                <X className="w-4 h-4" />
                Anuluj
              </button>
            </div>
          )}
          {!profile?.emailVerified && !pendingEmailVerify && (
            <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <p className="text-sm text-yellow-400">
                <strong>Uwaga:</strong> Niezweryfikowany adres email może ograniczać dostęp do niektórych funkcji systemu.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Theme preferences */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Wygląd aplikacji</h2>
          <p className="text-sm text-[var(--text-muted)]">Preferencje motywu</p>
        </div>
        <div className="flex items-center justify-between p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
          <div>
            <p className="text-sm font-medium text-[var(--text-main)]">Tryb ciemny</p>
            <p className="text-xs text-[var(--text-muted)]">
              {theme === "dark" ? "Włączony" : "Wyłączony"}
            </p>
          </div>
          <ThemeToggle />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-3">
          Motyw jest zapisywany w Twoim profilu i stosowany przy każdym logowaniu.
        </p>
      </div>
    </div>
  );
}
