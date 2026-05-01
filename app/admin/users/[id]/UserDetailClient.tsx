"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Check,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Pencil,
  Send,
  Shield,
  Trash2,
  Unlock,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  FieldWrapper,
  Input,
  PageShell,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { ApiRequestError } from "@/lib/api-client";
import {
  adminUserService,
  type AdminUserSummary,
} from "@/app/account/account-service";

import { PermissionsPanel } from "./PermissionsPanel";
import { SecurityPanel } from "./SecurityPanel";
import { IntegrationsPanel } from "./IntegrationsPanel";

/**
 * /admin/users/[id] — szczegóły użytkownika (edycja end-to-end).
 *
 * Sekcje:
 *   - Nagłówek z szybkimi akcjami (wyłącz/włącz, wyloguj sesje,
 *     odblokuj brute-force, usuń konto)
 *   - Uprawnienia w aplikacjach (PermissionsPanel → UserRolesList)
 *   - Bezpieczeństwo (SecurityPanel — reset hasła, actions)
 *   - Integracje (IntegrationsPanel — Google, Kadromierz)
 *   - Sesje (SessionsCard — active sessions + logout all)
 *   - Aktywność (ActivityLog — event feed z Keycloak)
 *   - Dane profilu (imię, nazwisko, email, telefon — edycja)
 */

interface Props {
  userId: string;
  selfId?: string;
  callerLabel: string;
  callerEmail?: string;
  /** Deep-link do Keycloak Admin Console — replacement dla sekcji Sesje/Logi. */
  kcUserUrl?: string | null;
}

type User = AdminUserSummary & { attributes: Record<string, string[]> };

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  const ms = ts > 100_000_000_000 ? ts : ts * 1000;
  return new Date(ms).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fullName(u: AdminUserSummary): string {
  return (
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username
  );
}

export function UserDetailClient({
  userId,
  selfId,
  callerLabel,
  callerEmail,
  kcUserUrl,
}: Props) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  // brute-force lock status — używamy go do gating przycisku "Odblokuj"
  // (admin nie powinien widzieć aktywnej akcji na nie-zablokowanym koncie).
  const [lockStatus, setLockStatus] = useState<{
    disabled: boolean;
    numFailures: number;
  } | null>(null);

  const refreshLockStatus = useCallback(async () => {
    try {
      const s = await adminUserService.getLockStatus(userId);
      setLockStatus({ disabled: s.disabled, numFailures: s.numFailures });
    } catch {
      setLockStatus(null);
    }
  }, [userId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUserService.get(userId);
      setUser(res);
      setProfileDraft({
        firstName: res.firstName ?? "",
        lastName: res.lastName ?? "",
        email: res.email ?? "",
        phone:
          res.attributes?.phoneNumber?.[0] ?? res.attributes?.phone?.[0] ?? "",
      });
      void refreshLockStatus();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać danych użytkownika",
      );
    } finally {
      setLoading(false);
    }
  }, [userId, refreshLockStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const isSelf = selfId === userId;

  const profileDirty = useMemo(() => {
    if (!user) return false;
    const phone =
      user.attributes?.phoneNumber?.[0] ?? user.attributes?.phone?.[0] ?? "";
    return (
      profileDraft.firstName !== (user.firstName ?? "") ||
      profileDraft.lastName !== (user.lastName ?? "") ||
      profileDraft.email !== (user.email ?? "") ||
      profileDraft.phone !== phone
    );
  }, [profileDraft, user]);

  const saveProfile = useCallback(async () => {
    if (!user || !profileDirty) return;
    setSavingProfile(true);
    setError(null);
    try {
      const currentPhone =
        user.attributes?.phoneNumber?.[0] ?? user.attributes?.phone?.[0] ?? "";
      const phoneChanged = profileDraft.phone !== currentPhone;
      await adminUserService.update(userId, {
        firstName: profileDraft.firstName,
        lastName: profileDraft.lastName,
        email: profileDraft.email,
        ...(phoneChanged && {
          attributes: {
            phoneNumber: profileDraft.phone.trim()
              ? [profileDraft.phone.trim()]
              : null,
          },
        }),
      });
      setNotice(
        "Profil zaktualizowany — zmiany zostały wypchane do Keycloak oraz natywnych aplikacji.",
      );
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zapisać profilu",
      );
    } finally {
      setSavingProfile(false);
    }
  }, [user, profileDirty, userId, profileDraft, refresh]);

  const toggleEnabled = useCallback(async () => {
    if (!user || isSelf) return;
    setPendingAction("toggle");
    setError(null);
    try {
      await adminUserService.update(userId, { enabled: !user.enabled });
      setNotice(user.enabled ? "Konto wyłączone" : "Konto włączone");
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zmienić statusu",
      );
    } finally {
      setPendingAction(null);
    }
  }, [user, isSelf, userId, refresh]);

  const logoutAll = useCallback(async () => {
    if (!user) return;
    if (!window.confirm("Zakończyć wszystkie sesje tego użytkownika?")) return;
    setPendingAction("logout");
    setError(null);
    try {
      await adminUserService.logoutAll(userId);
      setNotice("Wszystkie sesje zakończone");
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się zakończyć sesji",
      );
    } finally {
      setPendingAction(null);
    }
  }, [user, userId]);

  const unlock = useCallback(async () => {
    if (!user) return;
    setPendingAction("unlock");
    setError(null);
    try {
      await adminUserService.unlock(userId);
      setNotice("Blokada brute-force zdjęta");
      void refreshLockStatus();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się odblokować",
      );
    } finally {
      setPendingAction(null);
    }
  }, [user, userId, refreshLockStatus]);

  const deleteAccount = useCallback(async () => {
    if (!user || isSelf) return;
    const label = user.email || user.username;
    if (
      !window.confirm(
        `Usunąć konto ${label}?\n\nOperacja NIEODWRACALNA — konto Keycloak zostanie skasowane wraz ze wszystkimi sesjami i mapowaniami ról.`,
      )
    ) {
      return;
    }
    setPendingAction("delete");
    setError(null);
    try {
      await adminUserService.remove(userId);
      router.push("/admin/users");
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się usunąć konta",
      );
      setPendingAction(null);
    }
  }, [user, isSelf, userId, router]);

  if (loading && !user) {
    return (
      <PageShell
        header={<AppHeader userLabel={callerLabel} userSubLabel={callerEmail} />}
      >
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Ładowanie…
        </div>
      </PageShell>
    );
  }

  if (!user) {
    return (
      <PageShell
        header={<AppHeader userLabel={callerLabel} userSubLabel={callerEmail} />}
      >
        <Alert tone="error">{error ?? "Nie znaleziono użytkownika"}</Alert>
        <div className="mt-4">
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Wróć do listy
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      header={<AppHeader userLabel={callerLabel} userSubLabel={callerEmail} />}
    >
      <div className="mb-4">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Wróć do listy użytkowników
        </Link>
      </div>

      <section className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-main)]">
            {fullName(user)}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {user.email ?? "brak emaila"} · {user.username}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge tone={user.enabled ? "success" : "danger"}>
              {user.enabled ? "aktywny" : "wyłączony"}
            </Badge>
            {user.emailVerified ? (
              <Badge tone="success">email zweryfikowany</Badge>
            ) : (
              <Badge tone="warning">email niezweryfikowany</Badge>
            )}
            {user.requiredActions.length > 0 && (
              <Badge tone="info">
                wymagane: {user.requiredActions.join(", ")}
              </Badge>
            )}
            <span className="text-xs text-[var(--text-muted)]">
              utworzono {formatDate(user.createdTimestamp)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={user.enabled ? "secondary" : "primary"}
            size="sm"
            onClick={() => void toggleEnabled()}
            loading={pendingAction === "toggle"}
            disabled={isSelf || !!pendingAction}
            leftIcon={
              user.enabled ? (
                <Ban className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Check className="w-4 h-4" aria-hidden="true" />
              )
            }
            title={
              isSelf
                ? "Nie można wyłączyć własnego konta"
                : user.enabled
                  ? "Wyłącz konto (blokuje logowanie)"
                  : "Włącz konto"
            }
          >
            {user.enabled ? "Wyłącz" : "Włącz"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void logoutAll()}
            loading={pendingAction === "logout"}
            disabled={!!pendingAction}
            leftIcon={<LogOut className="w-4 h-4" aria-hidden="true" />}
          >
            Wyloguj sesje
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void unlock()}
            loading={pendingAction === "unlock"}
            // Disabled gdy konto nie jest zablokowane przez brute-force —
            // odblokowanie nie-zablokowanego konta to no-op, więc nie kuszmy
            // adminów falszywym wrażeniem zmiany. Pozostaje aktywne tylko gdy
            // KC zwrócił `disabled=true` lub `numFailures>0`.
            disabled={
              !!pendingAction ||
              !lockStatus ||
              (!lockStatus.disabled && lockStatus.numFailures === 0)
            }
            leftIcon={<Unlock className="w-4 h-4" aria-hidden="true" />}
            title={
              lockStatus && (lockStatus.disabled || lockStatus.numFailures > 0)
                ? `Konto zablokowane (${lockStatus.numFailures} nieudanych prób)`
                : "Konto nie jest zablokowane przez brute-force"
            }
          >
            Odblokuj
          </Button>
          {kcUserUrl && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(kcUserUrl, "_blank", "noopener,noreferrer")}
              leftIcon={<ExternalLink className="w-4 h-4" aria-hidden="true" />}
              title="Otwórz tę kartę użytkownika w Keycloak Admin Console (sesje, eventy, federated identity, role mappings)"
            >
              Otwórz w Keycloak
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void deleteAccount()}
            loading={pendingAction === "delete"}
            disabled={isSelf || !!pendingAction}
            leftIcon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
            className="text-red-500 hover:text-red-600"
          >
            Usuń konto
          </Button>
        </div>
      </section>

      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <Section title="Uprawnienia w aplikacjach" icon={Shield}>
        <PermissionsPanel
          userId={userId}
          onChanged={(summary) =>
            setNotice(summary ?? "Uprawnienia zaktualizowane")
          }
        />
      </Section>

      <Section title="Bezpieczeństwo" icon={KeyRound}>
        <SecurityPanel
          userId={userId}
          email={user.email}
          emailVerified={user.emailVerified}
          requiredActions={user.requiredActions}
          onUpdated={() => void refresh()}
        />
      </Section>

      <Section title="Integracje" icon={Link2}>
        <IntegrationsPanel userId={userId} />
      </Section>

      {/*
        Sekcje "Sesje" + "Logi aktywności" zostały usunięte — Keycloak Admin
        Console ma to natywnie (Users → Sessions, Events). Nie duplikujemy.
        Przycisk "Otwórz w Keycloak" w nagłówku linkuje wprost do tej karty.
      */}

      <Section title="Dane profilu" icon={Pencil}>
        <Card padding="md">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FieldWrapper id="pr-first" label="Imię">
              <Input
                id="pr-first"
                value={profileDraft.firstName}
                onChange={(e) =>
                  setProfileDraft((d) => ({ ...d, firstName: e.target.value }))
                }
              />
            </FieldWrapper>
            <FieldWrapper id="pr-last" label="Nazwisko">
              <Input
                id="pr-last"
                value={profileDraft.lastName}
                onChange={(e) =>
                  setProfileDraft((d) => ({ ...d, lastName: e.target.value }))
                }
              />
            </FieldWrapper>
            <FieldWrapper id="pr-email" label="Email">
              <Input
                id="pr-email"
                type="email"
                value={profileDraft.email}
                onChange={(e) =>
                  setProfileDraft((d) => ({ ...d, email: e.target.value }))
                }
              />
            </FieldWrapper>
            <FieldWrapper id="pr-phone" label="Telefon">
              <Input
                id="pr-phone"
                type="tel"
                placeholder="+48 ..."
                value={profileDraft.phone}
                onChange={(e) =>
                  setProfileDraft((d) => ({ ...d, phone: e.target.value }))
                }
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end mt-3 gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setProfileDraft({
                  firstName: user.firstName ?? "",
                  lastName: user.lastName ?? "",
                  email: user.email ?? "",
                  phone:
                    user.attributes?.phoneNumber?.[0] ??
                    user.attributes?.phone?.[0] ??
                    "",
                })
              }
              disabled={!profileDirty || savingProfile}
            >
              Cofnij
            </Button>
            <Button
              size="sm"
              onClick={() => void saveProfile()}
              loading={savingProfile}
              disabled={!profileDirty}
              leftIcon={<Send className="w-4 h-4" aria-hidden="true" />}
            >
              Zapisz profil
            </Button>
          </div>
        </Card>
      </Section>
    </PageShell>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-[var(--text-main)]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
