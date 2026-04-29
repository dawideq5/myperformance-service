"use client";

import { useProgress } from "@react-three/drei";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

/** Loading overlay z real progress (z @react-three/drei LoadingManager).
 * Pokazuje pasek + obecnie ładowany asset. Po 30s bez zmiany progress
 * zakładamy stuck i pokazujemy hint do reload. */
export default function ModelLoadingOverlay() {
  const { progress, active, item, loaded, total } = useProgress();
  const [stuckHint, setStuckHint] = useState(false);
  const [lastProgress, setLastProgress] = useState(0);
  const [lastChange, setLastChange] = useState(Date.now());

  useEffect(() => {
    if (progress !== lastProgress) {
      setLastProgress(progress);
      setLastChange(Date.now());
      setStuckHint(false);
    }
  }, [progress, lastProgress]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (Date.now() - lastChange > 30_000 && progress < 100) {
        setStuckHint(true);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [active, lastChange, progress]);

  if (!active && progress >= 100) return null;

  const pct = Math.round(progress);
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-fade-in z-10">
      <div className="bg-black/80 backdrop-blur-md rounded-2xl px-5 py-4 flex flex-col gap-3 border border-white/10 shadow-2xl min-w-[280px] max-w-[420px]">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <div className="flex-1">
            <p className="text-sm text-white font-semibold">
              Ładowanie modelu 3D
            </p>
            <p className="text-[11px] text-white/60 mt-0.5">
              {pct}% ({loaded}/{total})
            </p>
          </div>
        </div>
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        {item && (
          <p className="text-[10px] text-white/50 truncate" title={item}>
            {item.split("/").pop() || item}
          </p>
        )}
        {stuckHint && (
          <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1.5 pointer-events-auto">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>
              Ładowanie się przedłuża. Sprawdź konsolę (F12) lub odśwież
              stronę.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
