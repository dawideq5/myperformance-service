"use client";

import { useEffect, useRef, useState } from "react";

interface EmailHtmlPreviewProps {
  html: string | null;
  textFallback?: string | null;
}

/**
 * Sandboxed iframe rendering HTML maila. Sandbox ogranicza:
 *   - allow-same-origin: pozwala stylom + obrazom przy data: URI
 *   - allow-popups: zewnętrzne linki otwierają się targetnie (potem _blank)
 *
 * Bez `allow-scripts` — żadne <script> z maila nie wykonuje się.
 * Wysokość iframe auto-rośnie po onLoad do contentHeight (capped 4000px).
 */
export function EmailHtmlPreview({ html, textFallback }: EmailHtmlPreviewProps) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onLoad = () => {
      try {
        const doc = el.contentDocument;
        if (!doc) return;
        const h = Math.min(
          Math.max(doc.documentElement.scrollHeight, 200),
          4000,
        );
        setHeight(h);
      } catch {
        // cross-origin (allow-same-origin może nie wystarczyć dla srcdoc) — zostaw default
      }
    };
    el.addEventListener("load", onLoad);
    return () => el.removeEventListener("load", onLoad);
  }, [html]);

  if (!html) {
    return (
      <pre className="text-sm whitespace-pre-wrap font-mono p-4 bg-[var(--bg-main)] rounded-lg border border-[var(--border-subtle)]">
        {textFallback ?? "(brak treści)"}
      </pre>
    );
  }

  return (
    <iframe
      ref={ref}
      title="Podgląd wiadomości"
      sandbox="allow-popups allow-same-origin"
      srcDoc={html}
      className="w-full rounded-lg border border-[var(--border-subtle)] bg-white"
      style={{ height }}
    />
  );
}
