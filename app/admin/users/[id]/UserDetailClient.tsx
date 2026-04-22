"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Check,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
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

interface UserDetailClientProps {
  userId: string;
  selfId?: string;
  callerLabel: string;
  callerEmail?: string;
}

type User = AdminUserSummary & { attributes: Record<string, string[]> };

function formatDate(ts: number | null) {
  if (!ts) return "—";
  const ms = ts > 100000000000 ? ts : ts * 1000;
  return new Date(ms).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fullName(u: AdminUserSummary) {
  return (
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username
  );
}

export function UserDetailClient({
  userId,
  selfId,
  callerLabel,
  callerEmail,
}: UserDetailClientProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<{
    firstName: string;
    lastName: string;
    email: string;
  }>({ firstName: "", lastName: "", email: "" });
  const [pendingAction, setPendingAction] = useState<string | null>(null);

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
      });
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać danych użytkownika",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

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
    return (
      profileDraft.firstName !== (user.firstName ?? "") ||
      profileDraft.lastName !== (user.lastName ?? "") ||
      profileDraft.email !== (user.email ?? "")
    );
  }, [profileDraft, user]);

  const saveProfile = useCallback(async () => {
    if (!user || !profileDirty) return;
    setSavingProfile(true);
    setError(null);
    try {
      await adminUserService.update(userId, {
        firstName: profileDraft.firstName,
        lastName: profileDraft.lastName,
        email: profileDraft.email,
      });
      setNotice("Profil zaktualizowany");
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

  const sendPasswordReset = useCallback(async () => {
    if (!user?.email) return;
    if (!window.confirm(`Wysłać link resetu hasła do ${user.email}?`)) return;
    setPendingAction("password");
    setError(null);
    try {
      await adminUserService.resetPassword(userId, {
        sendEmail: true,
        temporary: false,
      });
      setNotice(`Wysłano link resetu hasła do ${user.email}`);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się wysłać linku",
      );
    } finally {
      setPendingAction(null);
    }
  }, [user, userId]);

  const sendVerifyEmail = useCallback(async () => {
    if (!user?.email) return;
    if (!window.confirm(`Wysłać link weryfikacji emaila do ${user.email}?`))
      return;
    setPendingAction("verify");
    setError(null);
    try {
      await adminUserService.sendActions(userId, {
        actions: ["VERIFY_EMAIL"],
        sendEmail: true,
      });
      setNotice(`Wysłano link weryfikacji emaila do ${user.email}`);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się wysłać linku",
      );
    } finally {
      setPendingAction(null);
    }
  }, [user, userId]);

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
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się odblokować",
      );
    } finally {
      setPendingAction(null);
    }
  }, [user, userId]);

  const deleteAccount = useCallback(async () => {
    if (!user || isSelf) return;
    const label = user.email || user.username;
    if (
      !window.confirm(
        `Czy na pewno usunąć konto ${label}?\n\nOperacja jest NIEODWRACALNA — konto Keycloak zostanie skasowane wraz ze wszystkimi sesjami i mapowaniami ról.`,
      )
    )
      return;
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

      <section className="mb-4 flex flex-wrap items-start justify-between gap-3">
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
            onClick={() => void sendPasswordReset()}
            loading={pendingAction === "password"}
            disabled={!user.email || !!pendingAction}
            leftIcon={<KeyRound className="w-4 h-4" aria-hidden="true" />}
          >
            Reset hasła (email)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void sendVerifyEmail()}
            loading={pendingAction === "verify"}
            disabled={!user.email || !!pendingAction}
            leftIcon={<Mail className="w-4 h-4" aria-hidden="true" />}
          >
            Weryfikuj email
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
            disabled={!!pendingAction}
            leftIcon={<Unlock className="w-4 h-4" aria-hidden="true" />}
          >
            Odblokuj
          </Button>
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

      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            Uprawnienia w aplikacjach
          </h2>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-3">
          Każda aplikacja ma kanoniczny zestaw ról przewidziany przez jej
          twórców. User może mieć maksymalnie jedną rolę w każdej aplikacji —
          zmiana jest synchronizowana do Keycloaka i natywnego systemu app
          (jeśli istnieje).
        </p>
        <PermissionsPanel
          userId={userId}
          onChanged={() => setNotice("Uprawnienia zaktualizowane")}
        />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Pencil className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            Dane profilu
          </h2>
        </div>
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
            <FieldWrapper id="pr-email" label="Email" className="md:col-span-2">
              <Input
                id="pr-email"
                type="email"
                value={profileDraft.email}
                onChange={(e) =>
                  setProfileDraft((d) => ({ ...d, email: e.target.value }))
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
      </section>
    </PageShell>
  );
}
