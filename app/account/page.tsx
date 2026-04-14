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
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface KeycloakSession {
  id: string;
  ipAddress: string;
  started: number;
  lastAccess: number;
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

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "sessions">("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<KeycloakSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL;
      
      // Fetch user profile
      const profileRes = await fetch(`${keycloakUrl}/realms/MyPerformance/account`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });
      
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);
      }

      // Fetch sessions
      const sessionsRes = await fetch(
        `${keycloakUrl}/realms/MyPerformance/account/sessions`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        }
      );
      
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setSessions(sessionsData.map((s: any) => ({ ...s, current: s.id === (session as any)?.user?.sub })));
      }
    } catch (err) {
      setError("Nie udało się pobrać danych z Keycloak");
    } finally {
      setLoading(false);
    }
  };

  const logoutSession = async (sessionId: string) => {
    try {
      const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL;
      const res = await fetch(
        `${keycloakUrl}/realms/MyPerformance/account/sessions/${sessionId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      
      if (res.ok) {
        setSessions(sessions.filter(s => s.id !== sessionId));
      }
    } catch (err) {
      console.error("Failed to logout session", err);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString("pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
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
                  <h2 className="text-lg font-semibold text-[var(--text-main)] mb-6">
                    Dane osobowe
                  </h2>
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
                      <div className="px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)]">
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
                  <p className="mt-4 text-xs text-[var(--text-muted)]">
                    Dane osobowe są synchronizowane z Keycloak. Aby je zmienić, przejdź do ustawień konta Keycloak.
                  </p>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === "security" && (
              <div className="space-y-6">
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <ShieldCheck className="w-6 h-6 text-green-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--text-main)]">
                        Weryfikacja dwuetapowa
                      </h2>
                      <p className="text-sm text-[var(--text-muted)]">
                        Status: Aktywna
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mb-4">
                    Twoje konto jest chronione przez weryfikację dwuetapową. Logowanie wymaga podania kodu z aplikacji uwierzytelniającej.
                  </p>
                  <a
                    href={`${process.env.NEXT_PUBLIC_KEYCLOAK_URL}/realms/MyPerformance/account/#/security/signingin`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] hover:underline"
                  >
                    Zarządzaj 2FA w Keycloak
                    <ChevronRight className="w-4 h-4" />
                  </a>
                </div>

                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                      <Key className="w-6 h-6 text-[var(--accent)]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--text-main)]">
                        Hasło
                      </h2>
                      <p className="text-sm text-[var(--text-muted)]">
                        Ostatnia zmiana: niedawno
                      </p>
                    </div>
                  </div>
                  <a
                    href={`${process.env.NEXT_PUBLIC_KEYCLOAK_URL}/realms/MyPerformance/account/#/security/signingin`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors"
                  >
                    Zmień hasło
                  </a>
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
                      sessions.map((s) => (
                        <div
                          key={s.id}
                          className={`flex items-center justify-between p-4 rounded-xl border ${
                            s.current
                              ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
                              : "border-[var(--border-subtle)] bg-[var(--bg-main)]"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-[var(--bg-card)] flex items-center justify-center">
                              <Globe className="w-5 h-5 text-[var(--text-muted)]" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-[var(--text-main)]">
                                {s.browser || "Przeglądarka"}
                                {s.current && (
                                  <span className="ml-2 text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded-full">
                                    Aktualna
                                  </span>
                                )}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-1">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Rozpoczęta: {formatDate(s.started)}
                                </span>
                                <span>•</span>
                                <span>IP: {s.ipAddress}</span>
                              </div>
                            </div>
                          </div>
                          {!s.current && (
                            <button
                              onClick={() => logoutSession(s.id)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Wyloguj sesję"
                            >
                              <LogOut className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))
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
