"use client";

import { useProgress } from "@react-three/drei";
import { Loader2 } from "lucide-react";

export default function ModelLoadingOverlay() {
  const { progress, active } = useProgress();
  if (!active && progress >= 100) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-fade-in z-10">
      <div className="bg-black/70 backdrop-blur-md rounded-2xl px-6 py-5 flex items-center gap-3 border border-white/10 shadow-2xl">
        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
        <div>
          <p className="text-sm text-white font-semibold">
            Ładowanie modelu 3D
          </p>
          <p className="text-[11px] text-white/60 mt-0.5">
            {Math.round(progress)}% — pierwszy raz może trochę potrwać
          </p>
        </div>
      </div>
    </div>
  );
}
