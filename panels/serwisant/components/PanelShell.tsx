"use client";

import { signOut } from "next-auth/react";
import { ArrowLeft, LogOut, User as UserIcon } from "lucide-react";

interface PanelShellProps {
  title: string;
  subtitle: string;
  userLabel: string;
  roles: string[];
}

export function PanelShell({ title, subtitle, userLabel, roles }: PanelShellProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-main)" }}>
      <header
        className="border-b backdrop-blur-md"
        style={{
          background: "var(--bg-header)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between gap-4">
          <a
            href="https://myperformance.pl/dashboard"
            className="flex items-center gap-2 font-bold tracking-tight"
            style={{ color: "var(--text-main)" }}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>MyPerformance</span>
          </a>
          <div className="flex items-center gap-3">
            {userLabel && (
              <div className="hidden sm:flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(99, 102, 241, 0.1)" }}
                >
                  <UserIcon className="w-5 h-5" style={{ color: "var(--accent)" }} aria-hidden="true" />
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--text-main)" }}>
                  {userLabel}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Wyloguj</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl w-full px-6 py-8 flex-1">
        <section
          className="rounded-2xl p-8 border"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl text-white"
              style={{
                background: "linear-gradient(135deg, #6366f1, #14b8a6)",
              }}
            >
              MP
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-main)" }}>
                {title}
              </h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {subtitle}
              </p>
            </div>
          </div>
          <p className="leading-relaxed" style={{ color: "var(--text-main)" }}>
            Witaj, <strong>{userLabel || "użytkowniku"}</strong>.
            Ten panel jest obecnie szkieletem. Funkcjonalność zostanie
            uzupełniona w kolejnych fazach.
          </p>
          <p className="mt-6 text-xs" style={{ color: "var(--text-muted)" }}>
            Twoje role: {roles.length ? roles.join(", ") : "brak"}
          </p>
        </section>
      </main>
    </div>
  );
}
