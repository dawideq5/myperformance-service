"use client";

import { useEffect, useState } from "react";
import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import { api } from "@/lib/api-client";

interface FooterLink {
  id: string;
  label: string;
  url: string;
  icon: string | null;
}

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// Allowlist URL schemes. CMS editor mógłby teoretycznie wstawić
// javascript:/data:/vbscript: w mp_links.url — odrzucamy.
function safeFooterUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    /^tel:/i.test(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#")
  ) {
    try {
      const decoded = decodeURIComponent(trimmed);
      if (/^(javascript|data|vbscript|file):/i.test(decoded.trim())) return null;
    } catch {
      /* noop */
    }
    return trimmed;
  }
  return null;
}

/**
 * Footer dashboardu — linki z mp_links (kategoria=footer). Public api: każdy
 * zalogowany user widzi linki bez area-restriction; linki z `requires_area`
 * filtrowane są server-side przez /api/cms/links.
 */
export function AppFooter() {
  const [links, setLinks] = useState<FooterLink[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<{ links: FooterLink[] }>(
          "/api/cms/links?category=footer",
        );
        if (!cancelled) setLinks(r.links);
      } catch {
        /* directus offline — footer po prostu pusty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (links.length === 0) return null;

  return (
    <footer className="mt-12 border-t border-[var(--border-subtle)] py-6">
      <nav
        className="mx-auto max-w-6xl px-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[var(--text-muted)]"
        aria-label="Stopka"
      >
        {links.map((l) => {
          const safeUrl = safeFooterUrl(l.url);
          if (!safeUrl) return null;
          const external = isExternal(safeUrl);
          return (
            <a
              key={l.id}
              href={safeUrl}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="inline-flex items-center gap-1.5 hover:text-[var(--text-main)] transition-colors"
            >
              {l.label}
              {external && (
                <ExternalLinkIcon className="w-3 h-3" aria-hidden="true" />
              )}
            </a>
          );
        })}
      </nav>
    </footer>
  );
}
