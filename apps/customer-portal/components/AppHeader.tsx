"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

const NAV: Array<{ href: string; label: string }> = [
  { href: "/status", label: "Sprawdź status" },
  { href: "/help", label: "Pomoc" },
];

export function AppHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 4);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-close mobile menu when ESC pressed lub klik na link.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className="sticky top-0 z-40 w-full border-b transition-shadow"
      style={{
        background: "var(--bg-main)",
        borderColor: "var(--border-subtle)",
        boxShadow: scrolled ? "0 2px 6px rgba(10,10,10,0.04)" : "none",
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link
          href="/"
          aria-label="Strona główna — Serwis telefonów by Caseownia"
          className="inline-flex items-center"
        >
          <Image
            src="/logo-serwis.png"
            alt="Serwis telefonów by Caseownia"
            width={1452}
            height={302}
            priority
            className="h-8 md:h-9 w-auto"
          />
        </Link>

        <nav
          className="hidden md:flex items-center gap-1 text-sm"
          aria-label="Główna nawigacja"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-md hover:bg-bg-muted transition-colors"
              style={{ color: "var(--text-main)" }}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/status"
            className="ml-3 inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            Sprawdź status
          </Link>
        </nav>

        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center rounded-md p-2"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Zamknij menu" : "Otwórz menu"}
          onClick={() => setOpen((v) => !v)}
          style={{ color: "var(--text-main)" }}
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {open ? (
        <div
          id="mobile-nav"
          className="md:hidden border-t"
          style={{
            borderColor: "var(--border-subtle)",
            background: "var(--bg-main)",
          }}
        >
          <nav className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded-md text-sm hover:bg-bg-muted transition-colors"
                style={{ color: "var(--text-main)" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
