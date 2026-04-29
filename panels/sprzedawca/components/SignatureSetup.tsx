"use client";

import { useEffect, useRef } from "react";

/** Auto-generuje podpis pracownika z imienia + nazwiska (cursive script
 * render na canvas → PNG data URL → upsert w mp_user_signatures). Bez
 * modala, bez interakcji user'a. Działa raz przy pierwszym wejściu —
 * po deploy każdy pracownik dostaje podpis automatycznie. */
export function SignatureSetup({
  userLabel,
  userEmail,
}: {
  userLabel: string;
  userEmail: string;
}) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void userEmail;

    (async () => {
      try {
        const check = await fetch("/api/relay/me/signature");
        if (check.ok) {
          const j = await check.json();
          if (j.signature?.pngDataUrl) return; // już ustawiony
        }
        const png = renderTextSignature(userLabel || "Pracownik");
        if (!png) return;
        await fetch("/api/relay/me/signature", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pngDataUrl: png, signedName: userLabel }),
        });
      } catch {
        /* best-effort — fallback w backend i tak generuje on-the-fly */
      }
    })();
  }, [userLabel, userEmail]);

  return null;
}

/** Renderuje cursive text na off-screen canvas, eksport PNG data URL. */
function renderTextSignature(name: string): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const dpr = 2;
  const W = 480;
  const H = 140;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#0f172a";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  let size = 64;
  ctx.font = `italic 600 ${size}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`;
  while (ctx.measureText(name).width > W - 40 && size > 22) {
    size -= 2;
    ctx.font = `italic 600 ${size}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`;
  }
  ctx.fillText(name, W / 2, H / 2);
  return canvas.toDataURL("image/png");
}
