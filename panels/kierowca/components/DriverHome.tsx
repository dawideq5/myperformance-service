"use client";

import { signOut } from "next-auth/react";
import { ArrowLeft, LogOut, Truck, User as UserIcon } from "lucide-react";
import { DriverDispatch } from "./tabs/DriverDispatch";
import { DASHBOARD_HOME_URL } from "@/lib/dashboard-url";

export function DriverHome({
  userLabel,
  userEmail,
}: {
  userLabel: string;
  userEmail: string;
}) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-main)" }}
    >
      <header
        className="border-b backdrop-blur-md sticky top-0 z-10"
        style={{
          background: "var(--bg-header)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href={DASHBOARD_HOME_URL}
              className="flex-shrink-0 p-2 rounded-lg"
              style={{ color: "var(--text-muted)" }}
              aria-label="Wróć do dashboardu"
            >
              <ArrowLeft className="w-5 h-5" />
            </a>
            <div className="min-w-0 flex items-center gap-2">
              <Truck
                className="w-5 h-5"
                style={{ color: "var(--accent)" }}
              />
              <div className="min-w-0">
                <p
                  className="font-bold text-base sm:text-lg truncate"
                  style={{ color: "var(--text-main)" }}
                >
                  Panel Kierowcy
                </p>
                <p
                  className="text-[11px] sm:text-xs truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  Zlecenia transportowe
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {userLabel && (
              <div
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--text-main)",
                }}
              >
                <UserIcon
                  className="w-4 h-4"
                  style={{ color: "var(--accent)" }}
                />
                <span>{userLabel}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-2 rounded-lg flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
              aria-label="Wyloguj"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden lg:inline">Wyloguj</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-6 sm:py-8 animate-fade-in">
        <DriverDispatch userEmail={userEmail} />
      </main>
    </div>
  );
}
