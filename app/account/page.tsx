"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
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
  X
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
}

interface TwoFAStatus {
  enabled: boolean;
  configured: boolean;
  qrCode?: string;
  secret?: string;
}

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "sessions" | "setup-2fa" | "setup-key">("profile");
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

  // 2FA state
  const [totpCode, setTotpCode] = useState("");
  const [settingUp2FA, setSettingUp2FA] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [twoFAError, setTwoFAError] = useState<string | null>(null);
  const [twoFASuccess, setTwoFASuccess] = useState(false);

  // WebAuthn state
  const [webauthnKeys, setWebauthnKeys] = useState<Array<{id: string; label: string; createdDate: number}>>([]);
  const [registeringKey, setRegisteringKey] = useState(false);
  const [keyLabel, setKeyLabel] = useState("");
  const [webauthnError, setWebauthnError] = useState<string | null>(null);
  const [webauthnSuccess, setWebauthnSuccess] = useState(false);

  const accessToken = (session as any)?.accessToken;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    
    if (accessToken) {
      fetchUserData();
    }
  }, [status, accessToken]);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      
      // Fetch user profile via local API
      const profileRes = await fetch("/api/account");
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);
      }

      // Fetch sessions via local API
      const sessionsRes = await fetch("/api/account/sessions");
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setSessions(sessionsData.map((s: any) => ({ ...s, current: s.id === (session as any)?.user?.sub })));
      }

      // Fetch 2FA status
      const twoFARes = await fetch("/api/account/2fa");
      if (twoFARes.ok) {
        const twoFAData = await twoFARes.json();
        setTwoFA(twoFAData);
      }

      // Fetch WebAuthn keys
      const webauthnRes = await fetch("/api/account/webauthn");
      if (webauthnRes.ok) {
        const webauthnData = await webauthnRes.json();
        setWebauthnKeys(webauthnData.keys || []);
      }
    } catch (err) {
      setError("Nie udało się pobrać danych");
    } finally {
      setLoading(false);
    }
  };

  const logoutSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/account/sessions/${sessionId}`, {
        method: "DELETE",
      });
      
      if (res.ok) {
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

  const generateQR = async () => {
    setSettingUp2FA(true);
    setTwoFAError(null);
    setTwoFASuccess(false);
    try {
      const res = await fetch("/api/account/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });

      const data = await res.json();
      if (res.ok) {
        setQrCode(data.qrCode);
        setTotpSecret(data.secret);
      } else {
        setTwoFAError(data.error || "Nie udało się wygenerować kodu QR");
      }
    } catch (err) {
      setTwoFAError("Wystąpił błąd podczas generowania kodu QR");
    } finally {
      setSettingUp2FA(false);
    }
  };

  const verify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying2FA(true);
    setTwoFAError(null);
    try {
      const res = await fetch("/api/account/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          totpCode,
          secret: totpSecret,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTwoFASuccess(true);
        setTwoFA({ enabled: true, configured: true });
        setQrCode(null);
        setTotpSecret(null);
        setTotpCode("");
      } else {
        setTwoFAError(data.error || "Nieprawidłowy kod weryfikacyjny");
      }
    } catch (err) {
      setTwoFAError("Wystąpił błąd podczas weryfikacji");
    } finally {
      setVerifying2FA(false);
    }
  };

  const disable2FA = async () => {
    try {
      const res = await fetch("/api/account/2fa", {
        method: "DELETE",
      });

      if (res.ok) {
        setTwoFA(prev => prev ? { ...prev, enabled: false, configured: false } : null);
        setTwoFASuccess(false);
      }
    } catch (err) {
      console.error("Failed to disable 2FA", err);
    }
  };

  const copySecret = () => {
    if (totpSecret) {
      navigator.clipboard.writeText(totpSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const registerWebAuthnKey = async () => {
    setRegisteringKey(true);
    setWebauthnError(null);
    setWebauthnSuccess(false);
    try {
      // Step 1: Get registration options
      const optionsRes = await fetch("/api/account/webauthn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-options" }),
      });

      if (!optionsRes.ok) {
        setWebauthnError("Nie udało się pobrać opcji rejestracji");
        return;
      }

      const { options } = await optionsRes.json();

      // Decode base64url values for WebAuthn API
      const challengeBytes = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const userIdBytes = Uint8Array.from(atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

      // Step 2: Call browser WebAuthn API
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeBytes,
          rp: { name: options.rp.name, id: window.location.hostname },
          user: {
            id: userIdBytes,
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams,
          timeout: options.timeout,
          attestation: options.attestation as AttestationConveyancePreference,
          authenticatorSelection: {
            ...options.authenticatorSelection,
            authenticatorAttachment: undefined,
            userVerification: "preferred" as UserVerificationRequirement,
          },
        },
      }) as PublicKeyCredential;

      if (!credential) {
        setWebauthnError("Rejestracja klucza została anulowana");
        return;
      }

      const attestationResponse = credential.response as AuthenticatorAttestationResponse;

      // Encode credential data
      const credentialData = {
        id: credential.id,
        rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
        publicKey: btoa(String.fromCharCode(...new Uint8Array(attestationResponse.getPublicKey?.() || new ArrayBuffer(0)))),
        attestationObject: btoa(String.fromCharCode(...new Uint8Array(attestationResponse.attestationObject))),
        clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(attestationResponse.clientDataJSON))),
      };

      // Step 3: Save credential to server
      const registerRes = await fetch("/api/account/webauthn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          credential: credentialData,
          label: keyLabel || "Klucz bezpieczeństwa",
        }),
      });

      if (registerRes.ok) {
        setWebauthnSuccess(true);
        setKeyLabel("");
        // Refresh keys
        const keysRes = await fetch("/api/account/webauthn");
        if (keysRes.ok) {
          const keysData = await keysRes.json();
          setWebauthnKeys(keysData.keys || []);
        }
      } else {
        const data = await registerRes.json();
        setWebauthnError(data.error || "Nie udało się zarejestrować klucza");
      }
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setWebauthnError("Rejestracja klucza została anulowana lub odrzucona");
      } else {
        setWebauthnError("Wystąpił błąd podczas rejestracji klucza");
      }
    } finally {
      setRegisteringKey(false);
    }
  };

  const deleteWebAuthnKey = async (credentialId: string) => {
    try {
      const res = await fetch(`/api/account/webauthn?id=${credentialId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setWebauthnKeys(prev => prev.filter(k => k.id !== credentialId));
      }
    } catch (err) {
      console.error("Failed to delete WebAuthn key", err);
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
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editFirstName,
          lastName: editLastName,
          email: editEmail,
        }),
      });

      if (res.ok) {
        setProfile(prev => prev ? { 
          ...prev, 
          firstName: editFirstName, 
          lastName: editLastName,
          email: editEmail 
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

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
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
    <div className="min-h-screen bg-[var(--bg-main)]">
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
          <main className="lg:col-span-3">
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
                    </div>
                  )}
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
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${twoFA?.enabled ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
                        <Smartphone className={`w-6 h-6 ${twoFA?.enabled ? "text-green-500" : "text-yellow-500"}`} />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--text-main)]">
                          Aplikacja uwierzytelniająca
                        </h2>
                        <p className="text-sm text-[var(--text-muted)]">
                          {twoFA?.enabled ? (
                            <span className="text-green-500">Skonfigurowana</span>
                          ) : (
                            <span className="text-yellow-500">Nieskonfigurowana</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab("setup-2fa")}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors"
                    >
                      {twoFA?.enabled ? "Zarządzaj" : "Skonfiguruj"}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Security Key Section */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <Key className="w-6 h-6 text-blue-500" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--text-main)]">
                          Klucz bezpieczeństwa
                        </h2>
                        <p className="text-sm text-[var(--text-muted)]">
                          WebAuthn / FIDO2
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab("setup-key")}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors"
                    >
                      Skonfiguruj
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
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

            {/* Setup 2FA View */}
            {activeTab === "setup-2fa" && (
              <div className="space-y-6">
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <button
                    onClick={() => { setActiveTab("security"); setQrCode(null); setTotpSecret(null); setTotpCode(""); setTwoFAError(null); setTwoFASuccess(false); }}
                    className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors mb-6"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Powrót do bezpieczeństwa
                  </button>

                  <div className="flex items-center gap-4 mb-6">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${twoFA?.enabled ? "bg-green-500/10" : "bg-[var(--accent)]/10"}`}>
                      <Smartphone className={`w-7 h-7 ${twoFA?.enabled ? "text-green-500" : "text-[var(--accent)]"}`} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-[var(--text-main)]">
                        Aplikacja uwierzytelniająca
                      </h2>
                      <p className="text-sm text-[var(--text-muted)]">
                        Google Authenticator, Authy, Microsoft Authenticator
                      </p>
                    </div>
                  </div>

                  {twoFASuccess && (
                    <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-2 text-sm text-green-500">
                      <Check className="w-4 h-4" />
                      Weryfikacja dwuetapowa została aktywowana
                    </div>
                  )}

                  {twoFAError && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-sm text-red-500">
                      <AlertCircle className="w-4 h-4" />
                      {twoFAError}
                    </div>
                  )}

                  {twoFA?.enabled ? (
                    <div className="space-y-6">
                      <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="w-6 h-6 text-green-500" />
                          <div>
                            <p className="text-sm font-medium text-green-500">Aktywna</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              Twoje konto jest chronione weryfikacją dwuetapową (TOTP).
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-[var(--border-subtle)] pt-6">
                        <h3 className="text-sm font-semibold text-[var(--text-main)] mb-2">Wyłącz 2FA</h3>
                        <p className="text-sm text-[var(--text-muted)] mb-4">
                          Wyłączenie weryfikacji dwuetapowej obniży poziom bezpieczeństwa Twojego konta.
                        </p>
                        <button
                          onClick={disable2FA}
                          className="inline-flex items-center gap-2 px-4 py-2 border border-red-500/30 text-red-500 rounded-xl text-sm font-medium hover:bg-red-500/10 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Wyłącz weryfikację dwuetapową
                        </button>
                      </div>
                    </div>
                  ) : !qrCode ? (
                    <div className="space-y-6">
                      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                        <p className="text-sm text-yellow-600">
                          Weryfikacja dwuetapowa nie jest jeszcze skonfigurowana.
                        </p>
                      </div>

                      <div>
                        <h3 className="text-base font-semibold text-[var(--text-main)] mb-4">
                          Jak to działa?
                        </h3>
                        <ol className="space-y-4 text-sm text-[var(--text-muted)]">
                          <li className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center text-xs font-bold">1</span>
                            <span>Pobierz aplikację uwierzytelniającą (Google Authenticator, Authy, Microsoft Authenticator) na swój telefon.</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center text-xs font-bold">2</span>
                            <span>Kliknij przycisk poniżej, zeskanuj kod QR w aplikacji.</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center text-xs font-bold">3</span>
                            <span>Wpisz wygenerowany 6-cyfrowy kod weryfikacyjny, aby aktywować ochronę.</span>
                          </li>
                        </ol>
                      </div>

                      <button
                        onClick={generateQR}
                        disabled={settingUp2FA}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50"
                      >
                        {settingUp2FA ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
                        Wygeneruj kod QR
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-base font-semibold text-[var(--text-main)] mb-2">
                          Krok 1: Zeskanuj kod QR
                        </h3>
                        <p className="text-sm text-[var(--text-muted)] mb-4">
                          Otwórz aplikację uwierzytelniającą na telefonie i zeskanuj poniższy kod QR.
                        </p>
                      </div>

                      <div className="flex flex-col items-center gap-4">
                        <div className="p-4 bg-white rounded-2xl shadow-lg">
                          <img src={qrCode} alt="Kod QR do 2FA" className="w-56 h-56" />
                        </div>

                        <div className="w-full">
                          <p className="text-xs text-[var(--text-muted)] text-center mb-2">
                            Nie możesz zeskanować? Wpisz ręcznie:
                          </p>
                          <div className="flex items-center gap-2 p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                            <code className="flex-1 text-xs font-mono text-[var(--text-main)] break-all">
                              {totpSecret}
                            </code>
                            <button
                              onClick={copySecret}
                              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex-shrink-0"
                              title="Kopiuj sekret"
                            >
                              {copiedSecret ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-[var(--border-subtle)] pt-6">
                        <h3 className="text-base font-semibold text-[var(--text-main)] mb-2">
                          Krok 2: Wpisz kod weryfikacyjny
                        </h3>
                        <p className="text-sm text-[var(--text-muted)] mb-4">
                          Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej, aby potwierdzić konfigurację.
                        </p>

                        <form onSubmit={verify2FA} className="space-y-4">
                          <input
                            type="text"
                            value={totpCode}
                            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="000000"
                            className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] text-center text-2xl font-mono tracking-[0.5em] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                            maxLength={6}
                            autoFocus
                          />

                          <button
                            type="submit"
                            disabled={verifying2FA || totpCode.length !== 6}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50"
                          >
                            {verifying2FA ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                            Aktywuj weryfikację dwuetapową
                          </button>
                        </form>
                      </div>

                      <button
                        onClick={() => { setQrCode(null); setTotpSecret(null); setTotpCode(""); }}
                        className="w-full text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors text-center"
                      >
                        Wygeneruj nowy kod QR
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Setup Security Key View */}
            {activeTab === "setup-key" && (
              <div className="space-y-6">
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <button
                    onClick={() => { setActiveTab("security"); setWebauthnError(null); setWebauthnSuccess(false); }}
                    className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors mb-6"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Powrót do bezpieczeństwa
                  </button>

                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Key className="w-7 h-7 text-blue-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-[var(--text-main)]">
                        Klucz bezpieczeństwa
                      </h2>
                      <p className="text-sm text-[var(--text-muted)]">
                        WebAuthn / FIDO2 / Biometria
                      </p>
                    </div>
                  </div>

                  {webauthnSuccess && (
                    <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-2 text-sm text-green-500">
                      <Check className="w-4 h-4" />
                      Klucz bezpieczeństwa został zarejestrowany
                    </div>
                  )}

                  {webauthnError && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-sm text-red-500">
                      <AlertCircle className="w-4 h-4" />
                      {webauthnError}
                    </div>
                  )}

                  <div className="space-y-6">
                    {/* Registered keys */}
                    {webauthnKeys.length > 0 && (
                      <div>
                        <h3 className="text-base font-semibold text-[var(--text-main)] mb-3">
                          Zarejestrowane klucze
                        </h3>
                        <div className="space-y-2">
                          {webauthnKeys.map((key) => (
                            <div key={key.id} className="flex items-center justify-between p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                              <div className="flex items-center gap-3">
                                <Key className="w-5 h-5 text-blue-500" />
                                <div>
                                  <p className="text-sm font-medium text-[var(--text-main)]">{key.label}</p>
                                  {key.createdDate && (
                                    <p className="text-xs text-[var(--text-muted)]">
                                      Dodano: {formatDate(key.createdDate / 1000)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => deleteWebAuthnKey(key.id)}
                                className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                title="Usuń klucz"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <p className="text-sm text-blue-400">
                        Klucze bezpieczeństwa (YubiKey, Touch ID, Face ID, Windows Hello) zapewniają najwyższy poziom ochrony konta.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-base font-semibold text-[var(--text-main)] mb-4">
                        Dodaj nowy klucz
                      </h3>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm text-[var(--text-muted)] mb-2">
                            Nazwa klucza (opcjonalna)
                          </label>
                          <input
                            type="text"
                            value={keyLabel}
                            onChange={(e) => setKeyLabel(e.target.value)}
                            placeholder="np. YubiKey 5, MacBook Touch ID"
                            className="w-full px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <button
                          onClick={registerWebAuthnKey}
                          disabled={registeringKey}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                        >
                          {registeringKey ? <Loader2 className="w-5 h-5 animate-spin" /> : <Key className="w-5 h-5" />}
                          Zarejestruj klucz bezpieczeństwa
                        </button>

                        <p className="text-xs text-[var(--text-muted)] text-center">
                          Po kliknięciu przycisku przeglądarka wyświetli dialog rejestracji klucza.
                          Podłącz klucz USB lub użyj biometrii urządzenia.
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3">
                        Obsługiwane urządzenia
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="flex items-center gap-3 p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Key className="w-4 h-4 text-blue-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--text-main)]">YubiKey</p>
                            <p className="text-xs text-[var(--text-muted)]">USB / NFC</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-blue-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--text-main)]">Titan Key</p>
                            <p className="text-xs text-[var(--text-muted)]">USB / Bluetooth</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Smartphone className="w-4 h-4 text-blue-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--text-main)]">Touch ID / Face ID</p>
                            <p className="text-xs text-[var(--text-muted)]">Biometria Apple</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <ShieldCheck className="w-4 h-4 text-blue-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--text-main)]">Windows Hello</p>
                            <p className="text-xs text-[var(--text-muted)]">PIN / Biometria</p>
                          </div>
                        </div>
                      </div>
                    </div>
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
