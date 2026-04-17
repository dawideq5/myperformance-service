"use client";

import type { ReactNode } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { User, Shield, History, Plug, ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";

import type { KeycloakSession, UserProfile, TwoFAStatus } from "@/app/account/types";
import { ProfileTab } from "@/app/account/components/ProfileTab";
import { SecurityTab } from "@/app/account/components/SecurityTab";
import { SessionsTab } from "@/app/account/components/SessionsTab";
import { IntegrationsTab } from "@/app/account/components/IntegrationsTab";

type Tab = "profile" | "security" | "sessions" | "integrations";

export default function AccountPage() {
  const { data: session, status, update } = useSession();
  const accessToken = session?.accessToken;
  const sessionError = session?.error;

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<KeycloakSession[]>([]);
  const [twoFA, setTwoFA] = useState<TwoFAStatus | null>(null);
  const [webauthnKeys, setWebauthnKeys] = useState<Array<{ id: string; credentialId?: string; label: string; createdDate: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editPhonePrefix, setEditPhonePrefix] = useState("+48");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Pending required actions
  const [pending2FA, setPending2FA] = useState(false);
  const [pendingWebAuthn, setPendingWebAuthn] = useState(false);
  const [pendingEmailVerify, setPendingEmailVerify] = useState(false);
  const [configuringMethod, setConfiguringMethod] = useState<string | null>(null);

  // Google integration state
  const [googleConnected, setGoogleConnected] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleSuccess, setGoogleSuccess] = useState<string | null>(null);
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [googleFeatureEmail, setGoogleFeatureEmail] = useState(true);
  const [googleFeatureCalendar, setGoogleFeatureCalendar] = useState(true);
  const [googleFeatureGmail, setGoogleFeatureGmail] = useState(true);

  const sessionDataLoadedRef = useRef(false);

  const forceLogout = useCallback(async () => {
    await signOut({ callbackUrl: "/login" });
  }, []);

  const signOutWithKeycloak = useCallback(async () => {
    await signOut({ redirect: false });
    window.location.href = "/api/auth/logout";
  }, []);

  const apiRequest = useCallback((input: RequestInfo | URL, init?: RequestInit) => {
    return fetch(input, { ...init, cache: "no-store", credentials: "same-origin" });
  }, []);

  const fetchGoogleStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/google/status");
      if (res.ok) {
        const data = await res.json();
        setGoogleConnected(data.connected);
        return data;
      }
    } catch (err) {
      console.error("Failed to fetch Google status", err);
    }
    return null;
  }, []);

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      console.log("[fetchUserData] Starting fetch, accessToken exists:", !!accessToken);

      const [profileRes, sessionsRes, twoFARes, webauthnRes] = await Promise.all([
        apiRequest("/api/account"),
        fetch("/api/account/sessions"),
        fetch("/api/account/2fa"),
        fetch("/api/account/webauthn"),
      ]);

      console.log("[fetchUserData] Responses:", {
        profileStatus: profileRes.status,
        sessionsStatus: sessionsRes.status,
        twoFAStatus: twoFARes.status,
        webauthnStatus: webauthnRes.status,
      });

      if (profileRes.status === 401 || profileRes.status === 403) {
        setError("Sesja wygasła lub brak dostępu");
        return;
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const data = profileData.data ?? profileData;
        setProfile(data);

        const fullPhone = data.attributes?.["phone-number"]?.[0] || "";
        if (fullPhone.startsWith("+")) {
          const match = fullPhone.match(/^\+(\d{1,3})/);
          if (match) {
            setEditPhonePrefix(`+${match[1]}`);
            setEditPhoneNumber(fullPhone.substring(match[0].length).trim());
          } else {
            setEditPhoneNumber(fullPhone);
          }
        } else {
          setEditPhoneNumber(fullPhone);
        }

        const requiredActions = data.requiredActions || [];
        setPending2FA(requiredActions.includes("CONFIGURE_TOTP"));
        setPendingWebAuthn(requiredActions.includes("WEBAUTHN_REGISTER"));
        setPendingEmailVerify(requiredActions.includes("VERIFY_EMAIL"));
      }

      if (sessionsRes.ok) {
        const sessionsResponse = await sessionsRes.json();
        const sessionsData = sessionsResponse.data ?? sessionsResponse;
        setSessions(Array.isArray(sessionsData) ? sessionsData.map((s: any) => ({ ...s, current: s.id === (session as any)?.user?.sub })) : []);
      }

      if (twoFARes.ok) {
        setTwoFA(await twoFARes.json());
      }

      if (webauthnRes.ok) {
        const webauthnData = await webauthnRes.json();
        setWebauthnKeys(webauthnData.keys || []);
      }

      await fetchGoogleStatus();
      console.log("[fetchUserData] Completed successfully");
    } catch (err) {
      console.error("[fetchUserData] Error:", err);
      setError("Nie udało się pobrać danych");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, fetchGoogleStatus, session, accessToken]);

  const checkSessionActivity = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok || !(await response.json())?.expires) {
        await forceLogout();
      }
    } catch {
      await forceLogout();
    }
  }, [forceLogout]);

  useEffect(() => {
    if (sessionError === "RefreshTokenExpired") {
      void forceLogout();
      return;
    }
    if (status === "authenticated" && accessToken && !sessionDataLoadedRef.current) {
      sessionDataLoadedRef.current = true;
      void fetchUserData();
    }
  }, [status, accessToken, sessionError, forceLogout, fetchUserData]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && status === "authenticated") {
        void update();
        void fetchUserData();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status, update, fetchUserData]);

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === "visible") void checkSessionActivity();
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [checkSessionActivity]);

  useEffect(() => {
    const handleGoogleRedirect = async () => {
      const url = new URL(window.location.href);
      const googleLinking = url.searchParams.get("google_linking");
      const errorParam = url.searchParams.get("error");
      const tab = url.searchParams.get("tab");

      if (tab === "integrations") {
        setActiveTab("integrations");
        url.searchParams.delete("tab");
        window.history.replaceState({}, "", url.toString());
      }

      if (googleLinking === "1") {
        url.searchParams.delete("google_linking");
        window.history.replaceState({}, "", url.toString());

        const statusData = await fetchGoogleStatus();
        if (statusData?.connected) {
          setGoogleSuccess("Konto Google zostało pomyślnie powiązane.");
          try {
            const provResp = await fetch("/api/integrations/google/provision", { method: "POST" });
            const result = await provResp.json().catch(() => ({}));

            if (provResp.status === 409 && result?.error === "email_mismatch") {
              setGoogleSuccess(null);
              setGoogleError(result?.message || "Email konta Google nie zgadza się z emailem w MyPerformance. Połączenie zostało anulowane.");
              await fetchGoogleStatus();
            } else if (provResp.ok) {
              const parts: string[] = ["Konto Google powiązane."];
              if (result?.emailVerified?.ok) parts.push("Email został potwierdzony jako zweryfikowany.");
              if (result?.calendar?.ok) parts.push("Utworzono wydarzenie w kalendarzu.");
              else if (result?.calendar?.error) parts.push("Nie udało się utworzyć wydarzenia w kalendarzu.");
              if (result?.gmail?.ok) {
                parts.push(result.gmail.alreadyExists ? "Folder Gmail już istniał." : "Utworzono folder w Gmail.");
              } else if (result?.gmail?.error) {
                parts.push("Nie udało się utworzyć folderu Gmail.");
              }
              setGoogleSuccess(parts.join(" "));
              void fetchUserData();
            }
          } catch (provErr) {
            console.error("[Google Provision] Exception:", provErr);
          }
        } else {
          setGoogleSuccess(null);
          setGoogleError("link_not_completed");
        }
      } else if (errorParam) {
        setGoogleError(errorParam);
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.toString());
      }
    };

    void handleGoogleRedirect();
  }, [fetchGoogleStatus, fetchUserData]);

  // --- Handlers ---

  const setRequiredAction = async (action: string, methodName: string) => {
    try {
      setConfiguringMethod(methodName);
      const res = await fetch("/api/account/required-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.status === 401) { void signOut({ callbackUrl: "/login", redirect: true }); return; }
      if (res.ok) {
        if (action === "CONFIGURE_TOTP") setPending2FA(true);
        if (action === "WEBAUTHN_REGISTER") setPendingWebAuthn(true);
        if (action === "VERIFY_EMAIL") setPendingEmailVerify(true);
      }
    } catch (err) {
      console.error("[setRequiredAction]", err);
    } finally {
      setConfiguringMethod(null);
    }
  };

  const cancelRequiredAction = async (action: string) => {
    try {
      const res = await fetch(`/api/account/required-actions?action=${action}`, { method: "DELETE" });
      if (res.status === 401) { void signOut({ callbackUrl: "/login", redirect: true }); return; }
      if (res.ok) {
        if (action === "CONFIGURE_TOTP") setPending2FA(false);
        if (action === "WEBAUTHN_REGISTER") setPendingWebAuthn(false);
        if (action === "VERIFY_EMAIL") setPendingEmailVerify(false);
      }
    } catch (err) {
      console.error("[cancelRequiredAction]", err);
    }
  };

  const logoutSession = async (sessionId: string) => {
    try {
      const res = await apiRequest(`/api/account/sessions/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        const isCurrentSession = sessions.find((s) => s.id === sessionId)?.current;
        if (isCurrentSession) { await signOutWithKeycloak(); return; }
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } catch (err) {
      console.error("Failed to logout session", err);
    }
  };

  const startEditingProfile = () => {
    setEditFirstName(profile?.firstName || "");
    setEditLastName(profile?.lastName || "");
    setEditEmail(profile?.email || "");
    setEditingProfile(true);
    setProfileSuccess(false);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess(false);
    try {
      const fullPhoneNumber = editPhoneNumber ? `${editPhonePrefix} ${editPhoneNumber}` : "";
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editFirstName,
          lastName: editLastName,
          email: editEmail,
          attributes: { "phone-number": fullPhoneNumber ? [fullPhoneNumber] : [] },
        }),
      });
      if (res.status === 401) { void signOut({ callbackUrl: "/login", redirect: true }); return; }
      if (res.ok) {
        setProfile((prev) => prev ? {
          ...prev,
          firstName: editFirstName,
          lastName: editLastName,
          email: editEmail,
          attributes: { ...(prev.attributes || {}), "phone-number": fullPhoneNumber ? [fullPhoneNumber] : [] },
        } : null);
        setProfileSuccess(true);
        setEditingProfile(false);
      } else {
        const data = await res.json();
        setError(data.error?.message || data.error || "Nie udało się zapisać zmian");
      }
    } catch {
      setError("Wystąpił błąd podczas zapisywania");
    } finally {
      setSavingProfile(false);
    }
  };

  const connectGoogle = () => {
    setGoogleError(null);
    setGoogleSuccess(null);
    setGoogleFeatureEmail(true);
    setGoogleFeatureCalendar(true);
    setGoogleFeatureGmail(true);
    setGoogleModalOpen(true);
  };

  const submitGoogleLink = async () => {
    const features: string[] = [];
    if (googleFeatureEmail) features.push("email_verification");
    if (googleFeatureCalendar) features.push("calendar");
    if (googleFeatureGmail) features.push("gmail_labels");

    if (features.length === 0) { setGoogleError("Zaznacz przynajmniej jedną funkcję."); return; }

    try {
      setConnectingGoogle(true);
      setGoogleError(null);
      const saveRes = await fetch("/api/integrations/google/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features }),
      });
      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || "Nie udało się zapisać wyboru funkcji");
      }
      setGoogleModalOpen(false);
      await signIn("keycloak", { callbackUrl: "/account?tab=integrations&google_linking=1", redirect: true }, { kc_action: "idp_link:google" });
    } catch (err: any) {
      setGoogleError(err?.message || "Wystąpił błąd podczas łączenia konta Google");
      setConnectingGoogle(false);
    }
  };

  const disconnectGoogle = async () => {
    try {
      setConnectingGoogle(true);
      const res = await fetch("/api/integrations/google/disconnect", { method: "POST" });
      if (res.status === 401) { void signOut({ callbackUrl: "/login", redirect: true }); return; }
      if (res.ok) {
        setGoogleConnected(false);
        setGoogleSuccess(null);
        setGoogleError(null);
      }
    } catch (err) {
      console.error("Failed to disconnect Google", err);
    } finally {
      setConnectingGoogle(false);
    }
  };

  // --- Render guards ---

  const hasValidSession = status === "authenticated" && !!accessToken && sessionError !== "RefreshTokenExpired";

  if (status === "loading" || (hasValidSession && loading)) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)]">
        <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-header)]">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="h-8 w-72 rounded-lg bg-[var(--bg-card)] animate-pulse" />
          </div>
        </header>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid lg:grid-cols-4 gap-6">
            <aside className="lg:col-span-1 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-[var(--bg-card)] animate-pulse" />
              ))}
            </aside>
            <main className="lg:col-span-3 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-40 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] animate-pulse" />
              ))}
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (!hasValidSession) return null;

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">{error}</p>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: ReactNode; badge?: ReactNode }[] = [
    { id: "profile",      label: "Profil",        icon: <User className="w-5 h-5" /> },
    { id: "security",     label: "Bezpieczeństwo", icon: <Shield className="w-5 h-5" /> },
    { id: "sessions",     label: "Sesje",          icon: <History className="w-5 h-5" />,
      badge: sessions.length > 0 ? (
        <span className="ml-auto text-xs bg-[var(--bg-card)] px-2 py-0.5 rounded-full">
          {sessions.length}
        </span>
      ) : undefined },
    { id: "integrations", label: "Integracje",     icon: <Plug className="w-5 h-5" />,
      badge: googleConnected ? (
        <span className="ml-auto w-2 h-2 bg-green-500 rounded-full" />
      ) : undefined },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-main)] animate-fade-in">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-header)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Powrót</span>
            </Link>
            <div className="h-6 w-px bg-[var(--border-subtle)]" />
            <h1 className="text-xl font-bold text-[var(--text-main)]">Zarządzanie kontem</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
              <User className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-[var(--text-main)]">
                {profile?.firstName} {profile?.lastName}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{profile?.email}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1">
            <nav className="space-y-1">
              {tabs.map(({ id, label, icon, badge }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === id
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]"
                  }`}
                >
                  {icon}
                  <span>{label}</span>
                  {badge}
                </button>
              ))}
            </nav>
          </aside>

          <main className="lg:col-span-3">
            {activeTab === "profile" && (
              <ProfileTab
                profile={profile}
                editingProfile={editingProfile}
                editFirstName={editFirstName}
                editLastName={editLastName}
                editEmail={editEmail}
                editPhoneNumber={editPhoneNumber}
                editPhonePrefix={editPhonePrefix}
                setEditFirstName={setEditFirstName}
                setEditLastName={setEditLastName}
                setEditEmail={setEditEmail}
                setEditPhoneNumber={setEditPhoneNumber}
                setEditPhonePrefix={setEditPhonePrefix}
                savingProfile={savingProfile}
                profileSuccess={profileSuccess}
                pendingEmailVerify={pendingEmailVerify}
                configuringMethod={configuringMethod}
                onStartEditing={startEditingProfile}
                onCancelEditing={() => setEditingProfile(false)}
                onSaveProfile={saveProfile}
                onSetRequiredAction={setRequiredAction}
                onCancelRequiredAction={cancelRequiredAction}
              />
            )}
            {activeTab === "security" && (
              <SecurityTab
                twoFA={twoFA}
                pending2FA={pending2FA}
                pendingWebAuthn={pendingWebAuthn}
                webauthnKeys={webauthnKeys}
                setWebauthnKeys={setWebauthnKeys}
                configuringMethod={configuringMethod}
                onSetRequiredAction={setRequiredAction}
                onCancelRequiredAction={cancelRequiredAction}
                onSignOutWithKeycloak={signOutWithKeycloak}
              />
            )}
            {activeTab === "sessions" && (
              <SessionsTab
                sessions={sessions}
                onLogoutSession={logoutSession}
              />
            )}
            {activeTab === "integrations" && (
              <IntegrationsTab
                googleConnected={googleConnected}
                googleError={googleError}
                googleSuccess={googleSuccess}
                connectingGoogle={connectingGoogle}
                googleModalOpen={googleModalOpen}
                googleFeatureEmail={googleFeatureEmail}
                googleFeatureCalendar={googleFeatureCalendar}
                googleFeatureGmail={googleFeatureGmail}
                setGoogleModalOpen={setGoogleModalOpen}
                setGoogleFeatureEmail={setGoogleFeatureEmail}
                setGoogleFeatureCalendar={setGoogleFeatureCalendar}
                setGoogleFeatureGmail={setGoogleFeatureGmail}
                onConnectGoogle={connectGoogle}
                onDisconnectGoogle={disconnectGoogle}
                onSubmitGoogleLink={submitGoogleLink}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
