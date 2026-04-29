"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, X, Pen, Type } from "lucide-react";

interface Point {
  x: number;
  y: number;
}

type Mode = "draw" | "type";

/** Modal z signature pad — dwa tryby: rysowany (canvas pen) i tekstowy
 * (input → cursive script render). Eksport jako PNG base64. Używany do
 * podpisu pracownika przed wygenerowaniem PDF/wysłaniem elektronicznego
 * potwierdzenia. Tryb tekstowy — analogicznie do Documenso, dla user
 * bez touchpada/myszki. */
export function SignaturePadDialog({
  title = "Podpis pracownika",
  subtitle = "Podpisz dokument przed wygenerowaniem PDF lub wysłaniem do klienta.",
  signerName,
  defaultName = "",
  onCancel,
  onConfirm,
}: {
  title?: string;
  subtitle?: string;
  signerName: string;
  /** Pre-filled tekst dla trybu "type" (np. imię + nazwisko pracownika). */
  defaultName?: string;
  onCancel: () => void;
  /** Otrzymuje data URL PNG (transparent background, czarne linie). */
  onConfirm: (pngDataUrl: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(defaultName ? "type" : "draw");
  const [typedText, setTypedText] = useState(defaultName);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const typeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const lastPointRef = useRef<Point | null>(null);

  // Render typed signature na canvas. Cursive font Caveat (z Google Fonts
  // bundlowane lokalnie nie jest — fallback na "cursive" generic). Dla
  // korporacyjnych setupów font Brush Script MT/Lucida Handwriting.
  useEffect(() => {
    if (mode !== "type") return;
    const canvas = typeCanvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!typedText.trim()) return;
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    // Auto-fit font size — duży skok ale czytelny.
    let size = 56;
    ctx.font = `italic 600 ${size}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`;
    while (
      ctx.measureText(typedText).width > rect.width - 40 &&
      size > 18
    ) {
      size -= 2;
      ctx.font = `italic 600 ${size}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`;
    }
    ctx.fillText(typedText, rect.width / 2, rect.height / 2);
  }, [typedText, mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.4;
  }, []);

  const getPoint = (e: PointerEvent | React.PointerEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    lastPointRef.current = getPoint(e);
  };

  const draw = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    const last = lastPointRef.current ?? p;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    if (isEmpty) setIsEmpty(false);
  };

  const end = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const confirm = () => {
    if (mode === "type") {
      const canvas = typeCanvasRef.current;
      if (!canvas || !typedText.trim()) return;
      onConfirm(canvas.toDataURL("image/png"));
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    onConfirm(canvas.toDataURL("image/png"));
  };

  const canConfirm =
    mode === "type" ? typedText.trim().length >= 2 : !isEmpty;

  return (
    <div className="fixed inset-0 z-[2300] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div
        className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div
          className="px-5 py-3 border-b flex items-center justify-between"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div>
            <p
              className="text-base font-semibold flex items-center gap-2"
              style={{ color: "var(--text-main)" }}
            >
              <Pen className="w-4 h-4" />
              {title}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-white/10"
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Pole podpisu — {signerName || "podpisujący"}
            </p>
            <div
              className="flex p-1 rounded-lg gap-1"
              style={{ background: "var(--bg-surface)" }}
            >
              <button
                type="button"
                onClick={() => setMode("draw")}
                className="px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                style={{
                  background:
                    mode === "draw" ? "var(--accent)" : "transparent",
                  color: mode === "draw" ? "#fff" : "var(--text-muted)",
                }}
              >
                <Pen className="w-3 h-3" />
                Rysuj
              </button>
              <button
                type="button"
                onClick={() => setMode("type")}
                className="px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                style={{
                  background:
                    mode === "type" ? "var(--accent)" : "transparent",
                  color: mode === "type" ? "#fff" : "var(--text-muted)",
                }}
              >
                <Type className="w-3 h-3" />
                Wpisz
              </button>
            </div>
          </div>

          {mode === "draw" ? (
            <div
              className="relative rounded-xl border-2 border-dashed bg-white"
              style={{ borderColor: "rgba(99,102,241,0.3)" }}
            >
              <canvas
                ref={canvasRef}
                onPointerDown={start}
                onPointerMove={draw}
                onPointerUp={end}
                onPointerLeave={end}
                onPointerCancel={end}
                className="block w-full h-[200px] sm:h-[240px] touch-none cursor-crosshair"
                style={{ touchAction: "none" }}
              />
              {isEmpty && (
                <p className="absolute inset-0 flex items-center justify-center text-sm pointer-events-none text-slate-400 select-none">
                  Złap myszkę / dotknij, aby podpisać
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Wpisz imię i nazwisko"
                autoFocus
                className="w-full px-3 py-2 rounded-xl text-sm outline-none border"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
              <div
                className="rounded-xl border-2 border-dashed bg-white"
                style={{ borderColor: "rgba(99,102,241,0.3)" }}
              >
                <canvas
                  ref={typeCanvasRef}
                  className="block w-full h-[160px] sm:h-[200px]"
                />
              </div>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Wpisując imię potwierdzasz że jest to Twój podpis. Skutek
                prawny równy podpisowi rysowanemu.
              </p>
            </div>
          )}
          <div className="flex justify-between items-center mt-3 gap-2">
            {mode === "draw" ? (
              <button
                type="button"
                onClick={clear}
                disabled={isEmpty}
                className="px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 border disabled:opacity-40"
                style={{
                  background: "transparent",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                <Eraser className="w-3.5 h-3.5" />
                Wyczyść
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!canConfirm}
                className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent), #2563eb)",
                  color: "#fff",
                }}
              >
                Zatwierdź podpis
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
