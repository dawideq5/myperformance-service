"use client";

import { useSession, signIn, signOut } from "next-auth/react";
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
  Plug,
  Calendar,
  Tag,
  Settings,
  Shield as ShieldIcon,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { PhoneInput } from "@/components/PhoneInput";
import { useTheme } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  const { data: session, status, update } = useSession();
  const { theme, setTheme, isLoading: themeLoading } = useTheme();
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "sessions" | "integrations">("profile");
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
  const [pendingEmailVerify, setPendingEmailVerify] = useState(false);
  const [configuringMethod, setConfiguringMethod] = useState<string | null>(null);

  // Google integration state
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleScopes, setGoogleScopes] = useState<string[]>([]);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleSuccess, setGoogleSuccess] = useState<string | null>(null);
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [googleFeatureEmail, setGoogleFeatureEmail] = useState(true);
  const [googleFeatureCalendar, setGoogleFeatureCalendar] = useState(true);
  const [googleFeatureGmail, setGoogleFeatureGmail] = useState(true);

  const accessToken = (session as any)?.accessToken;
  const sessionError = (session as any)?.error;
  const sessionDataLoadedRef = useRef(false);

  const forceLogout = useCallback(async () => {
    await signOut({ callbackUrl: "/login" });
  }, []);

  // Fetch Google integration status
  const fetchGoogleStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/google/status");
      if (res.ok) {
        const data = await res.json();
        setGoogleConnected(data.connected);
        setGoogleScopes(data.scopes || []);
        return data;
      }
    } catch (err) {
      console.error("Failed to fetch Google status", err);
    }

    return null;
  }, []);

  // Open feature selection modal before triggering Keycloak AIA flow
  const connectGoogle = () => {
    console.log("[connectGoogle] Opening modal...");
    setGoogleError(null);
    setGoogleSuccess(null);
    setGoogleFeatureEmail(true);
    setGoogleFeatureCalendar(true);
    setGoogleFeatureGmail(true);
    setGoogleModalOpen(true);
  };

  // After user confirms features in the modal, persist selection then start
  // Keycloak 26.3+ AIA idp_link:google flow.
  const submitGoogleLink = async () => {
    console.log("[submitGoogleLink] Starting...");
    const features: string[] = [];
    if (googleFeatureEmail) features.push("email_verification");
    if (googleFeatureCalendar) features.push("calendar");
    if (googleFeatureGmail) features.push("gmail_labels");

    console.log("[submitGoogleLink] Selected features:", features);

    if (features.length === 0) {
      setGoogleError("Zaznacz przynajmniej jedną funkcję.");
      return;
    }

    try {
      setConnectingGoogle(true);
      setGoogleError(null);

      console.log("[submitGoogleLink] Calling /api/integrations/google/connect...");
      const saveRes = await fetch("/api/integrations/google/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features }),
      });
      console.log("[submitGoogleLink] Connect response status:", saveRes.status);

      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        console.error("[submitGoogleLink] Connect failed:", errData);
        throw new Error(errData.error || "Nie udało się zapisać wyboru funkcji");
      }

      const saveData = await saveRes.json();
      console.log("[submitGoogleLink] Connect success:", saveData);

      setGoogleModalOpen(false);

      console.log("[submitGoogleLink] Starting signIn with kc_action...");
      await signIn(
        "keycloak",
        {
          callbackUrl: "/account?tab=integrations&google_linking=1",
          redirect: true,
        },
        {
          kc_action: "idp_link:google",
        }
      );
    } catch (err: any) {
      console.error("[submitGoogleLink] Failed to connect Google", err);
      setGoogleError(err?.message || "Wystąpił błąd podczas łączenia konta Google");
      setConnectingGoogle(false);
    }
  };

  // Disconnect Google account
  const disconnectGoogle = async () => {
    if (!confirm("Czy na pewno chcesz odłączyć konto Google?")) {
      return;
    }

    try {
      setConnectingGoogle(true);
      const res = await fetch("/api/integrations/google/disconnect", {
        method: "POST",
      });

      if (res.status === 401) {
        signOut({ callbackUrl: "/login", redirect: true });
        return;
      }

      if (res.ok) {
        setGoogleConnected(false);
        setGoogleScopes([]);
        setGoogleSuccess(null);
        setGoogleError(null);
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || "Nie udało się odłączyć konta Google");
      }
    } catch (err) {
      console.error("Failed to disconnect Google", err);
      alert("Wystąpił błąd podczas odłączania konta Google");
    } finally {
      setConnectingGoogle(false);
    }
  };

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
        setPendingEmailVerify(requiredActions.includes("VERIFY_EMAIL"));
      }

      // Fetch Google integration status
      await fetchGoogleStatus();

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
  }, [apiRequest, fetchGoogleStatus, session]);

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

  // Refresh session when user returns to window (e.g., after email verification)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && status === "authenticated") {
        // Refresh session to pick up email verification changes
        void update();
        // Also refresh user data
        void fetchUserData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [status, update, fetchUserData]);

  // Handle Google OAuth callback query parameters
  useEffect(() => {
    const handleGoogleRedirect = async () => {
      const url = new URL(window.location.href);
      const googleLinking = url.searchParams.get("google_linking");
      const error = url.searchParams.get("error");

      if (googleLinking === "1") {
        const statusData = await fetchGoogleStatus();
        if (statusData?.connected) {
          setGoogleSuccess("Konto Google zostało pomyślnie powiązane.");
          setGoogleError(null);

          try {
            const provResp = await fetch("/api/integrations/google/provision", {
              method: "POST",
            });
            const result = await provResp.json().catch(() => ({}));
            console.log("[Google Provision] Status:", provResp.status, "Result:", result);

            if (provResp.status === 409 && result?.error === "email_mismatch") {
              setGoogleSuccess(null);
              setGoogleError(
                result?.message ||
                  "Email konta Google nie zgadza się z emailem w MyPerformance. Połączenie zostało anulowane."
              );
              await fetchGoogleStatus();
            } else if (provResp.ok) {
              const parts: string[] = ["Konto Google powiązane."];
              if (result?.emailVerified?.ok) {
                parts.push("Email został potwierdzony jako zweryfikowany.");
              }
              if (result?.calendar?.ok) {
                parts.push("Utworzono wydarzenie w kalendarzu.");
              } else if (result?.calendar?.error) {
                parts.push("Nie udało się utworzyć wydarzenia w kalendarzu.");
              }
              if (result?.gmail?.ok) {
                parts.push(
                  result.gmail.alreadyExists
                    ? "Folder Gmail już istniał."
                    : "Utworzono folder w Gmail."
                );
              } else if (result?.gmail?.error) {
                parts.push("Nie udało się utworzyć folderu Gmail.");
              }
              setGoogleSuccess(parts.join(" "));
              // Refresh profile since emailVerified might have changed
              void fetchUserData();
            } else {
              console.error(
                "[Google Provision] Request failed:",
                provResp.status,
                result
              );
            }
          } catch (provErr) {
            console.error("[Google Provision] Exception:", provErr);
          }
        } else {
          setGoogleSuccess(null);
          setGoogleError("link_not_completed");
        }

        url.searchParams.delete("google_linking");
        window.history.replaceState({}, "", url.toString());
      } else if (error) {
        setGoogleSuccess(null);
        setGoogleError(error);
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.toString());
      }

      const tab = url.searchParams.get("tab");
      if (tab === "integrations") {
        setActiveTab("integrations");
        url.searchParams.delete("tab");
        window.history.replaceState({}, "", url.toString());
      }
    };

    void handleGoogleRedirect();
  }, [fetchGoogleStatus]);

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
    // Sign out from NextAuth first (this will also trigger server-side Keycloak logout via events)
    await signOut({ redirect: false });

    // Redirect through the server-side logout endpoint
    window.location.href = "/api/auth/logout";
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
        signOut({ callbackUrl: "/login", redirect: true });
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
        signOut({ callbackUrl: "/login", redirect: true });
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
        signOut({ callbackUrl: "/login", redirect: true });
        return;
      }

      if (res.ok) {
        console.log("[UI setRequiredAction] POST OK, action:", action);
        if (action === "CONFIGURE_TOTP") setPending2FA(true);
        if (action === "WEBAUTHN_REGISTER") setPendingWebAuthn(true);
        if (action === "VERIFY_EMAIL") setPendingEmailVerify(true);

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
        signOut({ callbackUrl: "/login", redirect: true });
        return;
      }

      if (res.ok) {
        if (action === "CONFIGURE_TOTP") setPending2FA(false);
        if (action === "WEBAUTHN_REGISTER") setPendingWebAuthn(false);
        if (action === "VERIFY_EMAIL") setPendingEmailVerify(false);
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
        signOut({ callbackUrl: "/login", redirect: true });
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
              <button
                onClick={() => setActiveTab("integrations")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "integrations"
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]"
                }`}
              >
                <Plug className="w-5 h-5" />
                <span>Integracje</span>
                {googleConnected && (
                  <span className="ml-auto w-2 h-2 bg-green-500 rounded-full" />
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

                {/* Email Verification Section */}
                {(!profile?.emailVerified || pendingEmailVerify) && (
                  <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${profile?.emailVerified ? "bg-green-500/10" : pendingEmailVerify ? "bg-blue-500/10" : "bg-yellow-500/10"}`}>
                          <Mail className={`w-6 h-6 ${profile?.emailVerified ? "text-green-500" : pendingEmailVerify ? "text-blue-500" : "text-yellow-500"}`} />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-[var(--text-main)]">
                            Weryfikacja adresu email
                          </h2>
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
                          onClick={() => setRequiredAction("VERIFY_EMAIL", "EmailVerify")}
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
                        <div className="flex gap-3">
                          <button
                            onClick={() => cancelRequiredAction("VERIFY_EMAIL")}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-lg text-sm font-medium hover:bg-[var(--bg-main)] transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Anuluj
                          </button>
                        </div>
                      </div>
                    )}
                    {!profile?.emailVerified && !pendingEmailVerify && (
                      <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                        <p className="text-sm text-yellow-400">
                          <strong>Uwaga:</strong> Niezweryfikowany adres email może ograniczać dostęp do niektórych funkcji systemu. Kliknij przycisk &quot;Zweryfikuj&quot;, aby otrzymać link weryfikacyjny.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Theme Preferences Section */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--text-main)]">
                        Wygląd aplikacji
                      </h2>
                      <p className="text-sm text-[var(--text-muted)]">
                        Preferencje motywu
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-main)]">Tryb ciemny</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {theme === "dark" ? "Włączony" : "Wyłączony"}
                        </p>
                      </div>
                      <ThemeToggle />
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

            {/* Integrations Tab */}
            {activeTab === "integrations" && (
              <div className="space-y-6">
                {/* Google Integration Section */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${googleConnected ? "bg-green-500/10" : "bg-[var(--accent)]/10"}`}>
                        <Globe className={`w-6 h-6 ${googleConnected ? "text-green-500" : "text-[var(--accent)]"}`} />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--text-main)]">
                          Konto Google
                        </h2>
                        <p className="text-sm text-[var(--text-muted)]">
                          {googleConnected ? (
                            <span className="text-green-500">Połączone</span>
                          ) : (
                            "Niepołączone"
                          )}
                        </p>
                      </div>
                    </div>
                    {!googleConnected ? (
                      <button
                        onClick={connectGoogle}
                        disabled={connectingGoogle}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50"
                      >
                        {connectingGoogle ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        Połącz
                      </button>
                    ) : (
                      <button
                        onClick={disconnectGoogle}
                        disabled={connectingGoogle}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-red-500/30 text-red-500 rounded-xl text-sm font-medium hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {connectingGoogle ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        Odłącz
                      </button>
                    )}
                  </div>

                  {/* Error display */}
                  {googleError && (
                    <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <div className="flex items-center gap-2 text-red-500 mb-2">
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-medium">Błąd połączenia</span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">
                        {googleError === "access_denied" && "Odmówiono dostępu. Spróbuj ponownie lub skontaktuj się z administratorem."}
                        {googleError === "link_not_completed" && "Keycloak nie potwierdził powiązania konta Google. Spróbuj ponownie."}
                        {googleError === "internal_error" && "Wystąpił wewnętrzny błąd. Spróbuj ponownie później."}
                        {!["access_denied", "link_not_completed", "internal_error"].includes(googleError) && `Błąd: ${googleError}`}
                      </p>
                    </div>
                  )}

                  {googleSuccess && (
                    <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <div className="flex items-center gap-2 text-green-500 mb-2">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-medium">Połączenie zakończone powodzeniem</span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">{googleSuccess}</p>
                    </div>
                  )}

                  {/* Connection Status Info */}
                  {googleConnected && (
                    <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <div className="flex items-center gap-2 text-green-500 mb-2">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-medium">Konto Google jest połączone</span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">
                        Twoje konto Google zostało pomyślnie powiązane z systemem MyPerformance. System ma dostęp do wybranych funkcji w celu automatyzacji pracy.
                      </p>
                    </div>
                  )}

                  {/* Permissions Info Card */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-[var(--text-main)]">
                      Dostępne uprawnienia i funkcje
                    </h3>

                    {/* Email Verification */}
                    <div className="p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                          <ShieldCheck className="w-5 h-5 text-green-500" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-[var(--text-main)]">
                            Weryfikacja adresu email
                          </h4>
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            Potwierdzanie, że Twoje konto w systemie MyPerformance jest powiązane ze zweryfikowaną tożsamością Google.
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-green-500">
                              <CheckCircle2 className="w-3 h-3" />
                              Dostępne
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Calendar Access */}
                    <div className="p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-[var(--text-main)]">
                            Kalendarz Google
                          </h4>
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            Tworzenie wydarzeń, spotkań i przypomnień w Twoim kalendarzu na wyraźne polecenie lub w wyniku akcji w systemie.
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-green-500">
                              <CheckCircle2 className="w-3 h-3" />
                              Dostępne
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Gmail Labels & Filters */}
                    <div className="p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                          <Tag className="w-5 h-5 text-purple-500" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-[var(--text-main)]">
                            Organizacja skrzynki Gmail
                          </h4>
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            Tworzenie etykiety &quot;MyPerformance&quot; i ustawianie filtrów kierujących wiadomości z domeny @myperformance.pl.
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-green-500">
                              <CheckCircle2 className="w-3 h-3" />
                              Dostępne
                            </span>
                          </div>
                          <div className="mt-2 p-2 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
                            <p className="text-xs text-yellow-400">
                              <strong>Ważne:</strong> System NIE ma dostępu do treści wiadomości email. Może jedynie zarządzać strukturą folderów i regułami.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* What We DON'T Have Access To */}
                  <div className="mt-6 p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                    <h3 className="text-sm font-medium text-[var(--text-main)] mb-3 flex items-center gap-2">
                      <ShieldIcon className="w-4 h-4 text-[var(--accent)]" />
                      Czego NIE może robić system
                    </h3>
                    <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                      <li className="flex items-start gap-2">
                        <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span>Przeglądać lub czytać Twoje wiadomości email</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span>Wysyłać wiadomości w Twoim imieniu</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span>Usuwać plików z Dysku Google</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span>Przeglądać Twoje pliki na Dysku</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span>Modyfikować ustawień konta Google poza uprawnieniami</span>
                      </li>
                    </ul>
                  </div>

                  {/* Privacy & Security Note */}
                  <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium text-blue-400 mb-1">
                          Bezpieczeństwo i prywatność
                        </h4>
                        <p className="text-xs text-[var(--text-muted)]">
                          System działa na zasadzie <strong>zasady najmniejszego przywileju</strong> – ma dostęp wyłącznie do funkcji, które są niezbędne do działania.
                          Wszystkie operacje są transparentne i wykonywane wyłącznie na Twoje wyraźne polecenie lub w wyniku akcji w systemie MyPerformance.
                          Dostęp możesz w każdej chwili odwołać klikając przycisk &quot;Odłącz&quot;.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Troubleshooting */}
                  {googleConnected && (
                    <div className="mt-4 p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                      <h4 className="text-sm font-medium text-[var(--text-main)] mb-2 flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Problemy z połączeniem?
                      </h4>
                      <p className="text-xs text-[var(--text-muted)]">
                        Jeśli operacja się nie powiedzie (np. token wygasł lub odłączyłeś aplikację w ustawieniach Google),
                        odłącz i ponownie połącz konto Google używając przycisku powyżej.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

          </main>

          {/* Google Feature Selection Modal */}
          {googleModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setGoogleModalOpen(false)} />
              <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-[var(--text-main)]">
                    Wybierz funkcje integracji Google
                  </h3>
                  <button
                    onClick={() => setGoogleModalOpen(false)}
                    className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={googleFeatureEmail}
                      onChange={(e) => setGoogleFeatureEmail(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <div>
                      <span className="block text-sm font-medium text-[var(--text-main)]">
                        Weryfikacja email
                      </span>
                      <span className="block text-xs text-[var(--text-muted)] mt-1">
                        Potwierdź swój email przez Google (automatycznie oznacza email jako zweryfikowany)
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={googleFeatureCalendar}
                      onChange={(e) => setGoogleFeatureCalendar(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <div>
                      <span className="block text-sm font-medium text-[var(--text-main)]">
                        Kalendarz Google
                      </span>
                      <span className="block text-xs text-[var(--text-muted)] mt-1">
                        Twórz wydarzenia w Twoim kalendarzu (np. potwierdzenia połączenia)
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={googleFeatureGmail}
                      onChange={(e) => setGoogleFeatureGmail(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <div>
                      <span className="block text-sm font-medium text-[var(--text-main)]">
                        Foldery Gmail
                      </span>
                      <span className="block text-xs text-[var(--text-muted)] mt-1">
                        Twórz etykiety/foldery w Gmail (np. "MyPerformance")
                      </span>
                    </div>
                  </label>
                </div>

                <div className="bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-lg p-3 mb-6">
                  <p className="text-xs text-[var(--text-muted)]">
                    <Info className="w-3 h-3 inline mr-1" />
                    Google poprosi o wszystkie te uprawnienia na ekranie zgody. Możesz odznaczyć te, których nie chcesz udzielić.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setGoogleModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-xl text-sm font-medium hover:text-[var(--text-main)] transition-colors"
                  >
                    Anuluj
                  </button>
                  <button
                    onClick={submitGoogleLink}
                    disabled={connectingGoogle}
                    className="flex-1 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {connectingGoogle ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Łączenie...
                      </>
                    ) : (
                      "Połącz"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
