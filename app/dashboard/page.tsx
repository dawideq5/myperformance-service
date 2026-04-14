import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { 
  ShieldCheck
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

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans transition-colors duration-300">
      {/* Top Navigation - Ultra Minimal */}
      <nav className="fixed top-0 w-full z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-header)]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="font-bold tracking-tighter text-lg select-none">
            MyPerformance
          </div>

          <div className="flex items-center gap-3">
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

          {/* Clean Dashboard - No cards */}
          <div className="p-8 border-2 border-dashed border-[var(--border-subtle)] rounded-[2.5rem] flex flex-col items-center justify-center text-center opacity-40">
             <ShieldCheck className="w-10 h-10 mb-4 text-[var(--text-muted)]" />
             <p className="text-sm font-bold uppercase tracking-widest">Więcej usług wkrótce</p>
          </div>
        </div>
      </main>
    </div>
  );
}
