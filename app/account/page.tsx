"use client";

import { useSession, signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  User,
  Shield,
  Smartphone,
  History,
  Key,
  Mail,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Globe,
  Clock,
  LogOut,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
  Edit2,
  Info,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { PhoneInput } from "@/components/PhoneInput";
import { useTheme } from "@/components/ThemeProvider";
import { getCanonicalLoginUrl } from "@/lib/app-url";
import { getPublicKeycloakIssuer } from "@/lib/keycloak-config";

interface KeycloakSession {
  id: string;
  ipAddress: string;
  started: number;
  lastAccess: number;
  expires: number;
  browser: string;
  current: boolean;
}

interface UserProfile {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  attributes?: Record<string, string[]>;
  requiredActions?: string[];
}

interface TwoFAStatus {
  enabled: boolean;
  configured: boolean;
  qrCode?: string;
  secret?: string;
}

export default function AccountPage() {
  const { data: session, status } = useSession();
  const { theme, setTheme, isLoading: themeLoading } = useTheme();
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "sessions">("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<KeycloakSession[]>([]);
  const [twoFA, setTwoFA] = useState<TwoFAStatus | null>(null);
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

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // 2FA/WebAuthn state (for display only)
  const [twoFAError, setTwoFAError] = useState<string | null>(null);
  const [webauthnKeys, setWebauthnKeys] = useState<Array<{id: string; label: string; createdDate: number}>>([]);

  // Pending configuration states (required actions)
  const [pending2FA, setPending2FA] = useState(false);
  const [pendingWebAuthn, setPendingWebAuthn] = useState(false);
  const [configuringMethod, setConfiguringMethod] = useState<string | null>(null);

  const accessToken = (session as any)?.accessToken;
  const sessionError = (session as any)?.error;
  const sessionDataLoadedRef = useRef(false);

  const forceLogout = useCallback(async () => {
    await signOut({ callbackUrl: getCanonicalLoginUrl() });
  }, []);

  const apiRequest = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, {
        ...init,
        cache: "no-store",
        credentials: "same-origin",
      });

      return response;
    },
    []
  );

  const checkSessionActivity = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) {
        await forceLogout();
        return;
      }
      const currentSession = await response.json();
      if (!currentSession?.expires) {
        await forceLogout();
      }
    } catch {
      await forceLogout();
    }
  }, [forceLogout]);

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch user profile via local API
      const profileRes = await apiRequest("/api/account");
      if (profileRes.status === 401 || profileRes.status === 403) {
        setError("Sesja wygasła lub brak dostępu");
        return;
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);

        // Load user attributes
        const userAttrs = profileData.attributes || {};

        // Phone number - parse prefix and number
        const fullPhone = userAttrs["phone-number"]?.[0] || "";
        if (fullPhone.startsWith("+")) {
          // Extract prefix (e.g., +48, +1, +44)
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

        // Check for pending required actions
        const requiredActions = profileData.requiredActions || [];
        setPending2FA(requiredActions.includes("CONFIGURE_TOTP"));
        setPendingWebAuthn(requiredActions.includes("WEBAUTHN_REGISTER"));
      }

      // Check session validity first
      const sessionCheckRes = await fetch("/api/account");
      if (sessionCheckRes.status === 401) {
        setError("Sesja wygasła lub brak dostępu");
        return;
      }

      // Fetch sessions via local API
      const sessionsRes = await fetch("/api/account/sessions");
      if (sessionsRes.status === 401) {
        setError("Sesja wygasła lub brak dostępu");
        return;
      }
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setSessions(sessionsData.map((s: any) => ({ ...s, current: s.id === (session as any)?.user?.sub })));
      }

      // Fetch 2FA status
      const twoFARes = await fetch("/api/account/2fa");
      if (twoFARes.status === 401) {
        setError("Sesja wygasła lub brak dostępu");
        return;
      }
      if (twoFARes.ok) {
        const twoFAData = await twoFARes.json();
        setTwoFA(twoFAData);
      }

      // Fetch WebAuthn keys
      const webauthnRes = await fetch("/api/account/webauthn");
      if (webauthnRes.status === 401) {
        setError("Sesja wygasła lub brak dostępu");
        return;
      }
      if (webauthnRes.ok) {
        const webauthnData = await webauthnRes.json();
        setWebauthnKeys(webauthnData.keys || []);
      }
    } catch (err) {
      setError("Nie udało się pobrać danych");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, session]);

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
    const onResume = () => {
      if (document.visibilityState === "visible") {
        void checkSessionActivity();
      }
    };

    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);

    return () => {
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [checkSessionActivity]);

  const signOutWithKeycloak = async () => {
    // Build Keycloak logout URL
    const keycloakUrl = getPublicKeycloakIssuer();
    const idToken = (session as any)?.idToken;
    const redirectUri = encodeURIComponent(getCanonicalLoginUrl());
    
    const keycloakLogoutUrl = `${keycloakUrl}/protocol/openid-connect/logout?id_token_hint=${idToken}&post_logout_redirect_uri=${redirectUri}`;
    
    // Sign out from NextAuth first (this will also trigger server-side Keycloak logout via events)
    await signOut({ redirect: false });
    
    // Redirect to Keycloak logout to invalidate the session
    window.location.href = keycloakLogoutUrl;
  };

  const logoutSession = async (sessionId: string) => {
    try {
      const res = await apiRequest(`/api/account/sessions/${sessionId}`, {
        method: "DELETE",
      });
      
      if (res.ok) {
        // Check if this is the current session
        const currentSessionId = (session as any)?.user?.sub;
        const isCurrentSession = sessions.find(s => s.id === sessionId)?.current;
        
        if (isCurrentSession) {
          // Immediate redirect to Keycloak logout
          await signOutWithKeycloak();
          return;
        }
        
        setSessions(sessions.filter(s => s.id !== sessionId));
      }
    } catch (err) {
      console.error("Failed to logout session", err);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Hasła nie są identyczne");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Hasło musi mieć co najmniej 8 znaków");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.status === 401 || res.status === 403) {
        await forceLogout();
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setPasswordError(data.error || "Nie udało się zmienić hasła");
      } else {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setPasswordError("Wystąpił błąd podczas zmiany hasła");
    } finally {
      setChangingPassword(false);
    }
  };

  const deleteWebAuthnKey = async (credentialId: string) => {
    try {
      const res = await fetch(`/api/account/webauthn?id=${credentialId}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        signOut({ callbackUrl: getCanonicalLoginUrl(), redirect: true });
        return;
      }
      if (res.ok) {
        setWebauthnKeys((prev) => prev.filter((k) => k.id !== credentialId));
      }
    } catch (err) {
      console.error("Failed to delete WebAuthn key", err);
    }
  };

  const disable2FA = async () => {
    try {
      const res = await apiRequest("/api/account/2fa", {
        method: "DELETE",
      });

      if (res.status === 401) {
        signOut({ callbackUrl: getCanonicalLoginUrl(), redirect: true });
        return;
      }

      if (res.ok) {
        setTwoFA((prev) =>
          prev ? { ...prev, enabled: false, configured: false } : null
        );
      }
    } catch (err) {
      console.error("Failed to disable 2FA", err);
    }
  };

  const setRequiredAction = async (action: string, methodName: string) => {
    try {
      setConfiguringMethod(methodName);

      const res = await fetch("/api/account/required-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (res.status === 401) {
        signOut({ callbackUrl: getCanonicalLoginUrl(), redirect: true });
        return;
      }

      if (res.ok) {
        console.log("[UI setRequiredAction] POST OK, action:", action);
        if (action === "CONFIGURE_TOTP") setPending2FA(true);
        if (action === "WEBAUTHN_REGISTER") setPendingWebAuthn(true);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const profileRes = await fetch("/api/account");
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          console.log(
            "[UI setRequiredAction] profileData.requiredActions:",
            profileData.requiredActions
          );
          setProfile(profileData);

          const requiredActions = profileData.requiredActions || [];
          setPending2FA(requiredActions.includes("CONFIGURE_TOTP"));
          setPendingWebAuthn(requiredActions.includes("WEBAUTHN_REGISTER"));
        } else {
          console.error("[UI setRequiredAction] Failed to refresh profile");
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(
          errorData.error ||
            "Nie udało się ustawić konfiguracji. Spróbuj ponownie."
        );
      }
    } catch (err) {
      alert("Wystąpił błąd. Spróbuj ponownie.");
    } finally {
      setConfiguringMethod(null);
    }
  };

  const cancelRequiredAction = async (action: string) => {
    try {
      const res = await fetch(`/api/account/required-actions?action=${action}`, {
        method: "DELETE",
      });

      if (res.status === 401) {
        signOut({ callbackUrl: getCanonicalLoginUrl(), redirect: true });
        return;
      }

      if (res.ok) {
        if (action === "CONFIGURE_TOTP") setPending2FA(false);
        if (action === "WEBAUTHN_REGISTER") setPendingWebAuthn(false);
      } else {
        alert("Nie udało się anulować konfiguracji.");
      }
    } catch (err) {
      alert("Wystąpił błąd podczas anulowania.");
    }
  };

  const startEditingProfile = () => {
    setEditFirstName(profile?.firstName || "");
    setEditLastName(profile?.lastName || "");
    setEditEmail(profile?.email || "");
    // Phone already loaded in fetchUserData from attributes
    setEditingProfile(true);
    setProfileSuccess(false);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess(false);

    try {
      // Combine prefix and phone number
      const fullPhoneNumber = editPhoneNumber ? `${editPhonePrefix} ${editPhoneNumber}` : "";

      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editFirstName,
          lastName: editLastName,
          email: editEmail,
          attributes: {
            "phone-number": fullPhoneNumber ? [fullPhoneNumber] : [],
          },
        }),
      });

      if (res.status === 401) {
        signOut({ callbackUrl: getCanonicalLoginUrl(), redirect: true });
        return;
      }

      if (res.ok) {
        setProfile(prev => prev ? {
          ...prev,
          firstName: editFirstName,
          lastName: editLastName,
          email: editEmail,
          attributes: {
            ...(prev.attributes || {}),
            "phone-number": fullPhoneNumber ? [fullPhoneNumber] : [],
          }
        } : null);
        setProfileSuccess(true);
        setEditingProfile(false);
      } else {
        const data = await res.json();
        setError(data.error || "Nie udało się zapisać zmian");
      }
    } catch (err) {
      setError("Wystąpił błąd podczas zapisywania");
    } finally {
      setSavingProfile(false);
    }
  };

  const formatDate = (timestampSec: number) => {
    if (!timestampSec || timestampSec < 1000000) return "—";
    const ms = timestampSec > 1e12 ? timestampSec : timestampSec * 1000;
    return new Date(ms).toLocaleString("pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSessionProgress = (startedSec: number, expiresSec: number) => {
    const now = Math.floor(Date.now() / 1000);
    const total = expiresSec - startedSec;
    if (total <= 0) return 0;
    const elapsed = now - startedSec;
    const remaining = Math.max(0, Math.min(100, ((total - elapsed) / total) * 100));
    return remaining;
  };

  const formatTimeRemaining = (expiresSec: number) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = expiresSec - now;
    if (remaining <= 0) return "Wygasła";
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
  };

  const hasValidSession =
    status === "authenticated" &&
    !!(session as any)?.accessToken &&
    (session as any)?.error !== "RefreshTokenExpired";

  if (status === "loading" || (status === "authenticated" && !hasValidSession) || (hasValidSession && loading)) {
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
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-12 rounded-xl bg-[var(--bg-card)] animate-pulse" />
              ))}
            </aside>
            <main className="lg:col-span-3 space-y-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-40 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] animate-pulse"
                />
              ))}
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (!hasValidSession) {
    return null;
  }

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

  return (
    <div className="min-h-screen bg-[var(--bg-main)] animate-fade-in">
      {/* Header */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-header)]">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
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
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab("profile")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "profile"
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]"
                }`}
              >
                <User className="w-5 h-5" />
                <span>Profil</span>
              </button>
              <button
                onClick={() => setActiveTab("security")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "security"
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]"
                }`}
              >
                <Shield className="w-5 h-5" />
                <span>Bezpieczeństwo</span>
              </button>
              <button
                onClick={() => setActiveTab("sessions")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "sessions"
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]"
                }`}
              >
                <History className="w-5 h-5" />
                <span>Sesje</span>
                {sessions.length > 0 && (
                  <span className="ml-auto text-xs bg-[var(--bg-card)] px-2 py-0.5 rounded-full">
                    {sessions.length}
                  </span>
                )}
              </button>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-3 animate-slide-up">
            {/* Profile Tab */}
            {activeTab === "profile" && (
              <div className="space-y-6">
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-[var(--text-main)]">
                      Dane osobowe
                    </h2>
                    {!editingProfile && (
                      <button
                        onClick={startEditingProfile}
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
                    <form onSubmit={saveProfile} className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-[var(--text-muted)] mb-2">
                            Imię
                          </label>
                          <input
                            type="text"
                            value={editFirstName}
                            onChange={(e) => setEditFirstName(e.target.value)}
                            className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-[var(--text-muted)] mb-2">
                            Nazwisko
                          </label>
                          <input
                            type="text"
                            value={editLastName}
                            onChange={(e) => setEditLastName(e.target.value)}
                            className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-muted)] mb-2">
                          Email
                        </label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-muted)] mb-2">
                          Numer telefonu
                        </label>
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
                          {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Zapisz
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProfile(false)}
                          className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-xl text-sm font-medium hover:text-[var(--text-main)] transition-colors"
                        >
                          Anuluj
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm text-[var(--text-muted)] mb-2">
                          Imię
                        </label>
                        <div className="px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)]">
                          {profile?.firstName || "-"}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-muted)] mb-2">
                          Nazwisko
                        </label>
                        <div className="px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)]">
                          {profile?.lastName || "-"}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-muted)] mb-2">
                          Nazwa użytkownika
                        </label>
                        <div className="px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-muted)]">
                          {profile?.username || "-"}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-muted)] mb-2">
                          Email
                        </label>
                        <div className="flex items-center gap-2 px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)]">
                          <Mail className="w-4 h-4 text-[var(--text-muted)]" />
                          {profile?.email || "-"}
                          {profile?.emailVerified && (
                            <ShieldCheck className="w-4 h-4 text-green-500 ml-auto" />
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-muted)] mb-2">
                          Numer telefonu
                        </label>
                        <div className="flex items-center gap-2 px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)]">
                          <Smartphone className="w-4 h-4 text-[var(--text-muted)]" />
                          {profile?.attributes?.["phone-number"]?.[0] || "-"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Theme Preferences Section */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--text-main)]">
                          Wygląd aplikacji
                        </h2>
                        <p className="text-sm text-[var(--text-muted)]">
                          Preferencje motywu
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-600 to-slate-800" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-main)]">Tryb ciemny</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {theme === "dark" ? "Włączony" : "Wyłączony"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        disabled={themeLoading}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                          theme === "dark" ? "bg-[var(--accent)]" : "bg-[var(--border-subtle)]"
                        } disabled:opacity-50`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                            theme === "dark" ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    <p className="text-xs text-[var(--text-muted)]">
                      Motyw jest zapisywany w Twoim profilu i stosowany przy każdym logowaniu.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === "security" && (
              <div className="space-y-6">
                {/* 2FA Section */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${twoFA?.enabled ? "bg-green-500/10" : pending2FA ? "bg-blue-500/10" : "bg-yellow-500/10"}`}>
                        <Smartphone className={`w-6 h-6 ${twoFA?.enabled ? "text-green-500" : pending2FA ? "text-blue-500" : "text-yellow-500"}`} />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--text-main)]">
                          Aplikacja uwierzytelniająca
                        </h2>
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
                        onClick={() => setRequiredAction("CONFIGURE_TOTP", "2FA")}
                        disabled={configuringMethod === "2FA"}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50"
                      >
                        {configuringMethod === "2FA" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
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
                        Aplikacja uwierzytelniająca zostanie skonfigurowana przy następnym logowaniu. 
                        Wyloguj się i zaloguj ponownie, aby dokończyć konfigurację.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => signOutWithKeycloak()}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Wyloguj się teraz
                        </button>
                        <button
                          onClick={() => cancelRequiredAction("CONFIGURE_TOTP")}
                          className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-lg text-sm font-medium hover:bg-[var(--bg-main)] transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Anuluj
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2FA Details */}
                  {twoFA?.enabled && (
                    <div className="mt-6 p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Shield className="w-5 h-5 text-green-500" />
                          <div>
                            <p className="text-sm font-medium text-[var(--text-main)]">Aplikacja uwierzytelniająca</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              Status: Aktywna
                            </p>
                          </div>
                        </div>
                        <div className="p-2 text-[var(--text-muted)]">
                          <Info className="w-4 h-4" />
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

                {/* Security Key Section */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${webauthnKeys.length > 0 ? "bg-green-500/10" : pendingWebAuthn ? "bg-blue-500/10" : "bg-yellow-500/10"}`}>
                        <Key className={`w-6 h-6 ${webauthnKeys.length > 0 ? "text-green-500" : pendingWebAuthn ? "text-blue-500" : "text-yellow-500"}`} />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--text-main)]">
                          Klucz bezpieczeństwa
                        </h2>
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
                        onClick={() => setRequiredAction("WEBAUTHN_REGISTER", "WebAuthn")}
                        disabled={configuringMethod === "WebAuthn"}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                      >
                        {configuringMethod === "WebAuthn" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
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
                        Klucz bezpieczeństwa zostanie skonfigurowany przy następnym logowaniu. 
                        Wyloguj się i zaloguj ponownie, aby dokończyć konfigurację.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => signOutWithKeycloak()}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Wyloguj się teraz
                        </button>
                        <button
                          onClick={() => cancelRequiredAction("WEBAUTHN_REGISTER")}
                          className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-lg text-sm font-medium hover:bg-[var(--bg-main)] transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Anuluj
                        </button>
                      </div>
                    </div>
                  )}

                  {/* WebAuthn Keys List */}
                  {webauthnKeys.length > 0 && (
                    <div className="mt-6 space-y-3">
                      <h3 className="text-sm font-medium text-[var(--text-main)] mb-3">Zarejestrowane klucze</h3>
                      {webauthnKeys.map((key: any) => (
                        <div key={key.id} className="p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--border-subtle)]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Key className="w-5 h-5 text-green-500" />
                              <div>
                                <p className="text-sm font-medium text-[var(--text-main)]">{key.label}</p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  Dodano: {key.createdDate ? new Date(key.createdDate).toLocaleDateString('pl-PL') : 'Nieznana data'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={async () => {
                                  const newName = prompt("Wprowadź nową nazwę klucza:", key.label);
                                  if (newName && newName.trim() && newName !== key.label) {
                                    try {
                                      const res = await fetch("/api/account/webauthn", {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          credentialId: key.credentialId || key.id,
                                          newName: newName.trim()
                                        }),
                                      });

                                      if (res.ok) {
                                        const keysRes = await fetch("/api/account/webauthn");
                                        if (keysRes.ok) {
                                          const keysData = await keysRes.json();
                                          setWebauthnKeys(keysData.keys || []);
                                        }
                                      } else {
                                        const errorData = await res.json().catch(() => ({}));
                                        alert(errorData.error || "Nie udało się zmienić nazwy klucza");
                                      }
                                    } catch (err) {
                                      alert("Wystąpił błąd podczas zmiany nazwy");
                                    }
                                  }
                                }}
                                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                                title="Edytuj nazwę"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <div className="p-2 text-[var(--text-muted)]">
                                <Info className="w-4 h-4" />
                              </div>
                            </div>
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

                {/* Password Change Section */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                      <Key className="w-6 h-6 text-[var(--accent)]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--text-main)]">
                        Zmiana hasła
                      </h2>
                      <p className="text-sm text-[var(--text-muted)]">
                        Zmień hasło dostępu do konta
                      </p>
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
                      {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Zmień hasło
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Sessions Tab */}
            {activeTab === "sessions" && (
              <div className="space-y-6">
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-[var(--text-main)] mb-6">
                    Aktywne sesje
                  </h2>
                  <div className="space-y-4">
                    {sessions.length === 0 ? (
                      <p className="text-center text-[var(--text-muted)] py-8">
                        Brak aktywnych sesji
                      </p>
                    ) : (
                      sessions.map((s) => {
                        const progress = getSessionProgress(s.started, s.expires);
                        const remaining = formatTimeRemaining(s.expires);
                        return (
                          <div
                            key={s.id}
                            className={`p-4 rounded-xl border ${
                              s.current
                                ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
                                : "border-[var(--border-subtle)] bg-[var(--bg-main)]"
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-4 flex-1 min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-[var(--bg-card)] flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <Globe className="w-5 h-5 text-[var(--text-muted)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[var(--text-main)]">
                                    {s.browser || "Przeglądarka"}
                                    {s.current && (
                                      <span className="ml-2 text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded-full">
                                        Aktualna
                                      </span>
                                    )}
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2 text-xs text-[var(--text-muted)]">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3 flex-shrink-0" />
                                      Rozpoczęta: {formatDate(s.started)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3 flex-shrink-0" />
                                      Wygasa: {formatDate(s.expires)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Globe className="w-3 h-3 flex-shrink-0" />
                                      IP: {s.ipAddress}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3 flex-shrink-0" />
                                      Ostatnia aktywność: {formatDate(s.lastAccess)}
                                    </span>
                                  </div>

                                  {/* Progress bar */}
                                  <div className="mt-3">
                                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                                      <span>Pozostało: {remaining}</span>
                                      <span>{Math.round(progress)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-[var(--border-subtle)] rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          progress > 50 ? "bg-green-500" : progress > 20 ? "bg-yellow-500" : "bg-red-500"
                                        }`}
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {!s.current && (
                                <button
                                  onClick={() => logoutSession(s.id)}
                                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0 ml-2"
                                  title="Wyloguj sesję"
                                >
                                  <LogOut className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>
    </div>
  );
}
