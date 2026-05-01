"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  ChevronRight,
  Clock,
  Lock,
  Mail,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";

import { useId } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  OnboardingCard,
} from "@/components/ui";
import { PhoneInput } from "@/components/PhoneInput";
import { useAsyncAction } from "@/hooks/useAsyncAction";

import { useAccount } from "../AccountProvider";
import { accountService } from "../account-service";
import { ApiRequestError } from "@/lib/api-client";
import type { RequiredAction } from "../types";

interface ParsedPhone {
  prefix: string;
  local: string;
}

function parsePhone(value: string | undefined): ParsedPhone {
  if (!value) return { prefix: "+48", local: "" };
  if (value.startsWith("+")) {
    const match = value.match(/^\+(\d{1,3})/);
    if (match) {
      return {
        prefix: `+${match[1]}`,
        local: value.substring(match[0].length).trim(),
      };
    }
  }
  return { prefix: "+48", local: value };
}

function ReadonlyField({
  label,
  children,
  muted,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  muted?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="block text-sm font-medium text-[var(--text-muted)]">
        {label}
      </p>
      <div
        className={`px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl ${
          muted ? "text-[var(--text-muted)]" : "text-[var(--text-main)]"
        }`}
      >
        {children}
      </div>
      {hint && (
        <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
          <Lock className="w-3 h-3" aria-hidden="true" />
          {hint}
        </p>
      )}
    </div>
  );
}

export function ProfileTab() {
  const { profile, patchProfile, refetchProfile } = useAccount();
  const phoneId = useId();

  const [editingPhone, setEditingPhone] = useState(false);
  const [phonePrefix, setPhonePrefix] = useState("+48");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const { prefix, local } = parsePhone(profile.attributes?.["phone-number"]?.[0]);
    setPhonePrefix(prefix);
    setPhoneLocal(local);
  }, [profile]);

  const startEditingPhone = useCallback(() => {
    setShowSuccess(false);
    setEditingPhone(true);
  }, []);

  const cancelEditingPhone = useCallback(() => {
    if (!profile) {
      setEditingPhone(false);
      return;
    }
    const { prefix, local } = parsePhone(profile.attributes?.["phone-number"]?.[0]);
    setPhonePrefix(prefix);
    setPhoneLocal(local);
    setEditingPhone(false);
  }, [profile]);

  const saveAction = useAsyncAction(
    async () => {
      const fullPhone = phoneLocal ? `${phonePrefix} ${phoneLocal}` : "";
      // Wysyłamy WYŁĄCZNIE phone-number — backend i tak odrzuca firstName/
      // lastName/email z 400, ale klient też nie powinien ich w ogóle
      // umieszczać w payloadzie (clean whitelist on both sides).
      await accountService.updateProfile({
        attributes: { "phone-number": fullPhone ? [fullPhone] : [] },
      });
      return { fullPhone };
    },
    {
      resolveError: (err) =>
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zapisać numeru telefonu",
      onSuccess: ({ fullPhone }) => {
        if (!profile) return;
        patchProfile({
          ...profile,
          attributes: {
            ...(profile.attributes ?? {}),
            "phone-number": fullPhone ? [fullPhone] : [],
          },
        });
        setEditingPhone(false);
        setShowSuccess(true);
      },
    },
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      saveAction.run();
    },
    [saveAction],
  );

  const pendingEmailVerify =
    profile?.requiredActions?.includes("VERIFY_EMAIL") ?? false;
  const emailVerifyAction = useAsyncAction(
    async (action: RequiredAction) => accountService.setRequiredAction(action),
    { onSuccess: () => void refetchProfile() },
  );
  const cancelEmailVerifyAction = useAsyncAction(
    async (action: RequiredAction) => accountService.cancelRequiredAction(action),
    { onSuccess: () => void refetchProfile() },
  );

  return (
    <div className="space-y-6">
      <OnboardingCard
        storageKey="account-profile"
        title="Twoje dane są chronione"
      >
        Imię, nazwisko i adres email są zarządzane przez administratora —
        gwarantuje to spójność tożsamości we wszystkich aplikacjach (Chatwoot,
        Documenso, Outline, Moodle, Directus, Postal). Jeśli któreś z tych
        pól wymaga zmiany, skontaktuj się z administratorem. Numer telefonu
        możesz aktualizować samodzielnie.
      </OnboardingCard>

      <Card padding="md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            Dane osobowe
          </h2>
        </div>

        {showSuccess && (
          <div className="mb-4">
            <Alert tone="success">
              <span className="inline-flex items-center gap-2">
                <Check className="w-4 h-4" aria-hidden="true" />
                Numer telefonu został zapisany
              </span>
            </Alert>
          </div>
        )}

        {saveAction.error && (
          <div className="mb-4">
            <Alert tone="error" title="Nie udało się zapisać">
              {saveAction.error}
            </Alert>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <ReadonlyField
            label="Imię"
            hint="Tylko administrator może zmienić"
          >
            {profile?.firstName || "—"}
          </ReadonlyField>
          <ReadonlyField
            label="Nazwisko"
            hint="Tylko administrator może zmienić"
          >
            {profile?.lastName || "—"}
          </ReadonlyField>
          <ReadonlyField label="Nazwa użytkownika" muted>
            {profile?.username || "—"}
          </ReadonlyField>
          <ReadonlyField
            label="Email"
            hint="Tylko administrator może zmienić"
          >
            <div className="flex items-center gap-2">
              <Mail
                className="w-4 h-4 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <span className="truncate">{profile?.email || "—"}</span>
              {profile?.emailVerified && (
                <ShieldCheck
                  className="w-4 h-4 text-green-500 ml-auto"
                  aria-label="Zweryfikowany"
                />
              )}
            </div>
          </ReadonlyField>
        </div>
      </Card>

      <Card padding="md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            Numer telefonu
          </h2>
          {!editingPhone && (
            <Button variant="link" size="sm" onClick={startEditingPhone}>
              Edytuj
            </Button>
          )}
        </div>

        {editingPhone ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor={phoneId}
                className="block text-sm font-medium text-[var(--text-muted)]"
              >
                Numer telefonu
              </label>
              <div id={phoneId}>
                <PhoneInput
                  value={phoneLocal}
                  prefix={phonePrefix}
                  onChange={setPhoneLocal}
                  onPrefixChange={setPhonePrefix}
                  disabled={saveAction.pending}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={saveAction.pending}>
                Zapisz
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={cancelEditingPhone}
                disabled={saveAction.pending}
              >
                Anuluj
              </Button>
            </div>
          </form>
        ) : (
          <ReadonlyField label="Aktualny numer">
            <div className="flex items-center gap-2">
              <Smartphone
                className="w-4 h-4 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <span>{profile?.attributes?.["phone-number"]?.[0] || "—"}</span>
            </div>
          </ReadonlyField>
        )}
      </Card>

      {(!profile?.emailVerified || pendingEmailVerify) && (
        <Card padding="md">
          <CardHeader
            icon={<Mail className="w-6 h-6" aria-hidden="true" />}
            iconBgClassName={
              profile?.emailVerified
                ? "bg-green-500/10 text-green-500"
                : pendingEmailVerify
                  ? "bg-blue-500/10 text-blue-500"
                  : "bg-yellow-500/10 text-yellow-500"
            }
            title="Weryfikacja adresu email"
            description={
              profile?.emailVerified ? (
                <span className="text-green-500">Zweryfikowany</span>
              ) : pendingEmailVerify ? (
                <span className="text-blue-500">Link weryfikacyjny wysłany</span>
              ) : (
                <span className="text-yellow-500">Wymaga weryfikacji</span>
              )
            }
            action={
              !profile?.emailVerified && !pendingEmailVerify ? (
                <Button
                  size="md"
                  loading={emailVerifyAction.pending}
                  rightIcon={
                    !emailVerifyAction.pending && (
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    )
                  }
                  onClick={() => void emailVerifyAction.run("VERIFY_EMAIL")}
                >
                  Zweryfikuj
                </Button>
              ) : pendingEmailVerify ? (
                <Badge tone="info">
                  <Clock className="w-3 h-3 mr-1" aria-hidden="true" />
                  Oczekuje
                </Badge>
              ) : undefined
            }
          />
          {pendingEmailVerify && (
            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <p className="text-sm text-blue-400 mb-3">
                Na Twój adres email został wysłany link weryfikacyjny. Kliknij
                w link zawarty w wiadomości, aby potwierdzić własność adresu
                email.
              </p>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<X className="w-4 h-4" aria-hidden="true" />}
                loading={cancelEmailVerifyAction.pending}
                onClick={() =>
                  void cancelEmailVerifyAction.run("VERIFY_EMAIL")
                }
              >
                Anuluj
              </Button>
            </div>
          )}
          {!profile?.emailVerified && !pendingEmailVerify && (
            <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <p className="text-sm text-yellow-400">
                <strong>Uwaga:</strong> Niezweryfikowany adres email może
                ograniczać dostęp do niektórych funkcji systemu.
              </p>
            </div>
          )}
        </Card>
      )}

    </div>
  );
}
