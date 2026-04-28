"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

/** Drawable 3x3 pattern lock grid. Wynik = string sekwencji indeksów (0-8),
 * np. "0,1,2,5,8" dla L-shape od top-left. */
export function PatternLock({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [path, setPath] = useState<number[]>(() =>
    value
      ? value
          .split(",")
          .map((s) => Number(s))
          .filter((n) => !isNaN(n) && n >= 0 && n <= 8)
      : [],
  );

  useEffect(() => {
    onChange(path.join(","));
  }, [path, onChange]);

  const SIZE = 240;
  const PADDING = 30;
  const GRID = 3;
  const dotPos = (i: number): [number, number] => {
    const col = i % GRID;
    const row = Math.floor(i / GRID);
    const step = (SIZE - PADDING * 2) / (GRID - 1);
    return [PADDING + col * step, PADDING + row * step];
  };

  const dotAtPoint = (x: number, y: number): number | null => {
    for (let i = 0; i < 9; i++) {
      const [dx, dy] = dotPos(i);
      const dist = Math.hypot(x - dx, y - dy);
      if (dist < 26) return i;
    }
    return null;
  };

  const screenToSvg = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    return [
      ((clientX - rect.left) / rect.width) * SIZE,
      ((clientY - rect.top) / rect.height) * SIZE,
    ];
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDrawing(true);
    setPath([]);
    const [x, y] = screenToSvg(e.clientX, e.clientY);
    const dot = dotAtPoint(x, y);
    if (dot !== null) setPath([dot]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const [x, y] = screenToSvg(e.clientX, e.clientY);
    const dot = dotAtPoint(x, y);
    if (dot !== null && !path.includes(dot)) {
      setPath((p) => [...p, dot]);
    }
  };

  const handlePointerUp = () => {
    setDrawing(false);
  };

  const reset = () => setPath([]);

  return (
    <div
      className="rounded-2xl border p-4 flex flex-col items-center gap-2"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[240px] touch-none select-none"
        style={{ userSelect: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Linie między aktywnymi kropkami — gradient stroke. */}
        <defs>
          <linearGradient id="patternGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
        {path.length > 1 && (
          <polyline
            points={path
              .map((i) => {
                const [x, y] = dotPos(i);
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="url(#patternGradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        )}
        {/* Dots */}
        {Array.from({ length: 9 }).map((_, i) => {
          const [x, y] = dotPos(i);
          const active = path.includes(i);
          const order = path.indexOf(i);
          return (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r={active ? 18 : 10}
                fill={active ? "url(#patternGradient)" : "var(--text-muted)"}
                opacity={active ? 1 : 0.4}
                style={{ transition: "r 0.18s ease, opacity 0.18s ease" }}
              />
              {active && (
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fontSize="14"
                  fontWeight="700"
                  fill="#fff"
                >
                  {order + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-mono"
          style={{ color: "var(--text-muted)" }}
        >
          {path.length === 0
            ? "Narysuj wzór palcem (lub myszką)"
            : `${path.length} pkt: ${path.map((i) => i + 1).join(" → ")}`}
        </span>
        {path.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="p-1 rounded hover:bg-[var(--bg-card)] transition-colors"
            style={{ color: "var(--text-muted)" }}
            title="Wyczyść wzór"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
