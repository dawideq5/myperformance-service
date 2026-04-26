"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  ChevronRight,
  Clock,
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
  Input,
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
}: {
  label: string;
  children: React.ReactNode;
  muted?: boolean;
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
    </div>
  );
}

export function ProfileTab() {
  const { profile, patchProfile, refetchProfile } = useAccount();
  const phoneId = useId();

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phonePrefix, setPhonePrefix] = useState("+48");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const { prefix, local } = parsePhone(profile.attributes?.["phone-number"]?.[0]);
    setPhonePrefix(prefix);
    setPhoneLocal(local);
  }, [profile]);

  const startEditing = useCallback(() => {
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
    setEmail(profile?.email ?? "");
    setShowSuccess(false);
    setEditing(true);
  }, [profile]);

  const saveAction = useAsyncAction(
    async () => {
      const fullPhone = phoneLocal ? `${phonePrefix} ${phoneLocal}` : "";
      await accountService.updateProfile({
        firstName,
        lastName,
        email,
        attributes: { "phone-number": fullPhone ? [fullPhone] : [] },
      });
      return { fullPhone };
    },
    {
      resolveError: (err) =>
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zapisać zmian",
      onSuccess: ({ fullPhone }) => {
        if (!profile) return;
        patchProfile({
          ...profile,
          firstName,
          lastName,
          email,
          attributes: {
            ...(profile.attributes ?? {}),
            "phone-number": fullPhone ? [fullPhone] : [],
          },
        });
        setEditing(false);
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
        title="Profil = SoT dla wszystkich aplikacji"
      >
        Zmiana danych tutaj propaguje się do Chatwoot, Documenso, Outline,
        Moodle, Directus i Postal w ciągu kilku sekund (kolejka z retry).
        Email zmiany powoduje rozłączenie Google (musisz połączyć ponownie),
        bo Keycloak traktuje email jako klucz federowanej tożsamości.
      </OnboardingCard>

      <Card padding="md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            Dane osobowe
          </h2>
          {!editing && (
            <Button variant="link" size="sm" onClick={startEditing}>
              Edytuj
            </Button>
          )}
        </div>

        {showSuccess && (
          <div className="mb-4">
            <Alert tone="success">
              <span className="inline-flex items-center gap-2">
                <Check className="w-4 h-4" aria-hidden="true" />
                Dane zostały zapisane
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

        {editing ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Imię"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                disabled={saveAction.pending}
              />
              <Input
                label="Nazwisko"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                disabled={saveAction.pending}
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={saveAction.pending}
            />
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
                onClick={() => setEditing(false)}
                disabled={saveAction.pending}
              >
                Anuluj
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <ReadonlyField label="Imię">
              {profile?.firstName || "—"}
            </ReadonlyField>
            <ReadonlyField label="Nazwisko">
              {profile?.lastName || "—"}
            </ReadonlyField>
            <ReadonlyField label="Nazwa użytkownika" muted>
              {profile?.username || "—"}
            </ReadonlyField>
            <ReadonlyField label="Email">
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
            <ReadonlyField label="Numer telefonu">
              <div className="flex items-center gap-2">
                <Smartphone
                  className="w-4 h-4 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
                <span>{profile?.attributes?.["phone-number"]?.[0] || "—"}</span>
              </div>
            </ReadonlyField>
          </div>
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
