import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { 
  User, ExternalLink, Key, Smartphone, Settings, ShieldCheck, Mail
} from "lucide-react";
import { authOptions } from "@/app/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * FINAL ULTRA-CLEAN DASHBOARD
 */

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  // Keycloak Account Console URL
  const keycloakAccountUrl = `${process.env.KEYCLOAK_ISSUER}/account`;

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans transition-colors duration-300">
      {/* Top Navigation - Ultra Minimal */}
      <nav className="fixed top-0 w-full z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-header)]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="font-bold tracking-tighter text-lg select-none">
            MyPerformance
          </div>

          <div className="flex items-center gap-3">
            <a 
              href={keycloakAccountUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-full text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
            >
              <User className="w-3.5 h-3.5" />
              <span>Zarządzaj kontem</span>
            </a>
            <div className="w-px h-4 bg-[var(--border-subtle)] mx-1" />
            <ThemeToggle />
            <LogoutButton idToken={session.idToken} />
          </div>
        </div>
      </nav>

      <main className="pt-40 max-w-4xl mx-auto px-6">
        <div className="flex flex-col items-center justify-center text-center">
          <h1 className="text-5xl font-black tracking-tight mb-16">
            Witaj, {session.user.name}
          </h1>

          {/* Actual Keycloak Functional Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
            <a 
              href={`${keycloakAccountUrl}/#/personal-info`}
              target="_blank"
              className="group p-8 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[2.5rem] hover:border-indigo-500/50 transition-all flex flex-col items-start gap-6 text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-1">Profil</h3>
                <p className="text-sm text-[var(--text-muted)] font-medium">Zaktualizuj swoje dane osobowe bezpośrednio w Keycloak.</p>
              </div>
              <div className="mt-auto pt-4 flex items-center gap-2 text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                OTWÓRZ USTAWIENIA <ExternalLink className="w-3 h-3" />
              </div>
            </a>

            <a 
              href={`${keycloakAccountUrl}/#/security/signing-in`}
              target="_blank"
              className="group p-8 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[2.5rem] hover:border-indigo-500/50 transition-all flex flex-col items-start gap-6 text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-1">Bezpieczeństwo</h3>
                <p className="text-sm text-[var(--text-muted)] font-medium">Zarządzaj hasłem oraz uwierzytelnianiem 2FA (TOTP/Klucze).</p>
              </div>
              <div className="mt-auto pt-4 flex items-center gap-2 text-xs font-bold text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                ZABEZPIECZ KONTO <ExternalLink className="w-3 h-3" />
              </div>
            </a>

            <a 
              href={`${keycloakAccountUrl}/#/security/device-activity`}
              target="_blank"
              className="group p-8 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[2.5rem] hover:border-indigo-500/50 transition-all flex flex-col items-start gap-6 text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 group-hover:bg-blue-500 group-hover:text-white transition-all">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-1">Sesje</h3>
                <p className="text-sm text-[var(--text-muted)] font-medium">Sprawdź aktywne urządzenia i wyloguj się zdalnie.</p>
              </div>
              <div className="mt-auto pt-4 flex items-center gap-2 text-xs font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                MONITORUJ SESJE <ExternalLink className="w-3 h-3" />
              </div>
            </a>

            <div className="p-8 border-2 border-dashed border-[var(--border-subtle)] rounded-[2.5rem] flex flex-col items-center justify-center text-center opacity-40 group cursor-not-allowed">
               <ShieldCheck className="w-10 h-10 mb-4 text-[var(--text-muted)]" />
               <p className="text-sm font-bold uppercase tracking-widest">Więcej usług wkrótce</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
