"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  ScanFace,
  Smartphone,
  Sparkles,
  Speaker,
  Wrench,
  X,
} from "lucide-react";
import type { HighlightId } from "./PhoneModel";

const Canvas = dynamic(
  () => import("@react-three/fiber").then((m) => m.Canvas),
  { ssr: false },
);
const PhoneScene = dynamic(() => import("./PhoneScene"), { ssr: false });

type StepId =
  | "display"
  | "back"
  | "cameras"
  | "frames"
  | "earpiece"
  | "speakers"
  | "port"
  | "front";

interface Step {
  id: StepId;
  title: string;
  subtitle: string;
  highlight: HighlightId;
  // Camera position [x, y, z] — kamera patrzy na środek (0,0,0).
  cameraPos: [number, number, number];
  /** Czy ten krok pyta o czyszczenie (kwota z cennika) */
  cleaningOffer?: "earpiece" | "speakers" | "port";
}

const STEPS: Step[] = [
  {
    id: "display",
    title: "Wyświetlacz",
    subtitle: "Oceń stan ekranu w skali 1–10. Możesz dodać opis usterek.",
    highlight: "display",
    cameraPos: [0, 0, 5.2],
  },
  {
    id: "back",
    title: "Tył urządzenia",
    subtitle: "Sprawdź pleckę pod kątem rys, pęknięć i odkształceń.",
    highlight: "back",
    cameraPos: [0, 0, -5.2],
  },
  {
    id: "cameras",
    title: "Wyspa aparatów",
    subtitle: "Stan obiektywów, szkiełek osłonowych i ramki wyspy.",
    highlight: "cameras",
    cameraPos: [-1.6, 1.4, -3.4],
  },
  {
    id: "frames",
    title: "Ramki boczne",
    subtitle: "Obejrzyj boki — zarysowania, wgniecenia, deformacje.",
    highlight: "frames",
    cameraPos: [4.6, 0, 1.5],
  },
  {
    id: "earpiece",
    title: "Głośnik rozmów",
    subtitle: "Pył i kurz w głośniku rozmów to częsta przyczyna problemów ze słyszalnością.",
    highlight: "earpiece",
    cameraPos: [0, 4.0, 1.6],
    cleaningOffer: "earpiece",
  },
  {
    id: "speakers",
    title: "Głośniczki dolne",
    subtitle: "Zatkane głośniczki = przytłumiony dźwięk. Czyszczenie zwykle pomaga.",
    highlight: "speakers",
    cameraPos: [0, -4.0, 1.6],
    cleaningOffer: "speakers",
  },
  {
    id: "port",
    title: "Port ładowania",
    subtitle: "Kurz w porcie = problem z ładowaniem. Profesjonalne czyszczenie często rozwiązuje.",
    highlight: "port",
    cameraPos: [0, -4.5, 1.0],
    cleaningOffer: "port",
  },
  {
    id: "front",
    title: "Podsumowanie",
    subtitle: "Ostatnia chwila na dodatkowe uwagi przed zapisem.",
    highlight: null,
    cameraPos: [0, 0, 5.2],
  },
];

export interface VisualConditionState {
  display_rating?: number;
  display_notes?: string;
  back_notes?: string;
  camera_notes?: string;
  frames_notes?: string;
  earpiece_clean?: boolean;
  speakers_clean?: boolean;
  port_clean?: boolean;
  additional_notes?: string;
}

const STEP_ICONS: Record<StepId, React.ComponentType<{ className?: string }>> = {
  display: Smartphone,
  back: Smartphone,
  cameras: ScanFace,
  frames: Cpu,
  earpiece: Speaker,
  speakers: Speaker,
  port: Wrench,
  front: CheckCircle2,
};

export function PhoneConfigurator3D({
  brand,
  brandColorHex,
  cleaningPrice,
  initial,
  onCancel,
  onComplete,
}: {
  brand: string;
  brandColorHex: string;
  cleaningPrice: number | null;
  initial?: VisualConditionState;
  onCancel: () => void;
  onComplete: (state: VisualConditionState) => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const [state, setState] = useState<VisualConditionState>(initial ?? {});
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  const next = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const prev = () => setStepIdx((i) => Math.max(i - 1, 0));

  const finish = () => {
    setClosing(true);
    // ~1.2s closing animation, potem onComplete.
    setTimeout(() => onComplete(state), 1200);
  };

  const StepIcon = STEP_ICONS[step.id];
  const update = (patch: Partial<VisualConditionState>) =>
    setState((s) => ({ ...s, ...patch }));

  return (
    <div
      className="fixed inset-0 z-[2050] flex flex-col"
      style={{
        background:
          "radial-gradient(circle at 50% 30%, #1a2138 0%, #0a0e1a 80%)",
      }}
    >
      <div
        className={`flex-1 flex flex-col transition-all duration-1000 ${
          closing ? "scale-50 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-black/30 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #3B82F6, #A855F7)",
                color: "#fff",
              }}
            >
              <StepIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">
                {step.title}
              </p>
              <p className="text-white/60 text-xs truncate">{step.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Zamknij konfigurator"
          >
            <X className="w-5 h-5 text-white/80" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${((stepIdx + 1) / STEPS.length) * 100}%`,
              background:
                "linear-gradient(90deg, #3B82F6, #A855F7, #EC4899)",
            }}
          />
        </div>

        {/* Main canvas */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr,minmax(320px,420px)] gap-0 min-h-0">
          <div
            className={`relative ${closing ? "phone-into-box" : ""}`}
            style={{ minHeight: 360 }}
          >
            <Canvas
              shadows
              camera={{ position: [0, 0, 5.2], fov: 38 }}
              dpr={[1, 2]}
            >
              <PhoneScene
                highlight={step.highlight}
                cameraPos={step.cameraPos}
                brandColor={brandColorHex}
                isFramesStep={step.id === "frames"}
              />
            </Canvas>
            {/* Overlay caption */}
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 text-[10px] uppercase tracking-wider text-white/80 font-mono flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              {brand || "Telefon"} · krok {stepIdx + 1} z {STEPS.length}
            </div>
          </div>

          {/* Step controls panel */}
          <div className="bg-white/5 backdrop-blur-md border-l border-white/10 p-4 overflow-y-auto">
            <StepInputs
              step={step}
              state={state}
              cleaningPrice={cleaningPrice}
              onChange={update}
            />
          </div>
        </div>

        {/* Bottom bar — nav */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-black/40 backdrop-blur-md border-t border-white/10 gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={stepIdx === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-white/10 text-white/80 disabled:opacity-30 hover:bg-white/10 transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Wstecz
          </button>
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    i === stepIdx
                      ? "#fff"
                      : i < stepIdx
                        ? "#22C55E"
                        : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </div>
          {stepIdx < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-lg"
              style={{
                background: "linear-gradient(135deg, #3B82F6, #A855F7)",
                color: "#fff",
              }}
            >
              Dalej
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-lg"
              style={{
                background: "linear-gradient(135deg, #22C55E, #16A34A)",
                color: "#fff",
              }}
            >
              Zapisz i zamknij
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Closing box overlay */}
      {closing && <ClosingBoxOverlay />}

      <style>{`
        .phone-into-box {
          animation: phoneIntoBox 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes phoneIntoBox {
          0%   { transform: scale(1) rotate(0deg); opacity: 1; }
          50%  { transform: scale(0.6) translateY(20%) rotate(-3deg); opacity: 0.9; }
          100% { transform: scale(0.2) translateY(40%) rotate(0deg); opacity: 0; }
        }
        .box-flap-top {
          animation: foldTop 0.7s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards;
          transform-origin: 50% 100%;
          transform: rotateX(180deg);
        }
        @keyframes foldTop {
          to { transform: rotateX(0deg); }
        }
      `}</style>
    </div>
  );
}

function StepInputs({
  step,
  state,
  cleaningPrice,
  onChange,
}: {
  step: Step;
  state: VisualConditionState;
  cleaningPrice: number | null;
  onChange: (patch: Partial<VisualConditionState>) => void;
}) {
  if (step.id === "display") {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/60 font-semibold mb-2">
            Stan wyświetlacza
          </p>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const active = state.display_rating === n;
              const color =
                n <= 3 ? "#EF4444" : n <= 6 ? "#F59E0B" : "#22C55E";
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange({ display_rating: n })}
                  className="aspect-square rounded-lg border text-xs font-bold transition-all hover:scale-110"
                  style={{
                    background: active ? color : "rgba(255,255,255,0.05)",
                    borderColor: active ? color : "rgba(255,255,255,0.1)",
                    color: active ? "#fff" : "rgba(255,255,255,0.7)",
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-white/50">
            <span>roztrzaskany</span>
            <span>idealny</span>
          </div>
        </div>
        <NotesField
          label="Komentarz do ekranu"
          value={state.display_notes ?? ""}
          onChange={(v) => onChange({ display_notes: v })}
        />
      </div>
    );
  }
  if (step.id === "back") {
    return (
      <NotesField
        label="Tył — uwagi"
        placeholder="Rysy, pęknięcia, odbarwienia, odkształcenia…"
        value={state.back_notes ?? ""}
        onChange={(v) => onChange({ back_notes: v })}
      />
    );
  }
  if (step.id === "cameras") {
    return (
      <NotesField
        label="Wyspa aparatów — uwagi"
        placeholder="Pęknięte szkiełka, brak ostrości, kurz w obiektywie…"
        value={state.camera_notes ?? ""}
        onChange={(v) => onChange({ camera_notes: v })}
      />
    );
  }
  if (step.id === "frames") {
    return (
      <NotesField
        label="Ramki boczne — uwagi"
        placeholder="Wgniecenia, otarcia, deformacje, działanie przycisków…"
        value={state.frames_notes ?? ""}
        onChange={(v) => onChange({ frames_notes: v })}
      />
    );
  }
  if (step.id === "front") {
    return (
      <NotesField
        label="Dodatkowe uwagi"
        placeholder="Wszystko, co istotne i nie zostało jeszcze zapisane…"
        value={state.additional_notes ?? ""}
        onChange={(v) => onChange({ additional_notes: v })}
        rows={5}
      />
    );
  }
  // earpiece / speakers / port — cleaning offers
  if (step.cleaningOffer) {
    const key = step.cleaningOffer;
    const stateKey =
      key === "earpiece"
        ? "earpiece_clean"
        : key === "speakers"
          ? "speakers_clean"
          : "port_clean";
    const current = state[stateKey];
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white/90 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Wykonać profesjonalne czyszczenie?
          </p>
          <p className="text-xs text-white/70 mb-3">
            Pył i kurz w tym miejscu często powoduje problemy. Dodajemy
            usługę czyszczenia
            {cleaningPrice != null ? (
              <>
                {" "}za <strong className="text-amber-400">{cleaningPrice} PLN</strong>
              </>
            ) : null}
            .
          </p>
          <div className="flex gap-2">
            <CleaningPill
              active={current === false}
              color="#EF4444"
              onClick={() => onChange({ [stateKey]: false } as Partial<VisualConditionState>)}
            >
              Pomiń
            </CleaningPill>
            <CleaningPill
              active={current === true}
              color="#22C55E"
              onClick={() => onChange({ [stateKey]: true } as Partial<VisualConditionState>)}
            >
              Tak, dodaj
            </CleaningPill>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function NotesField({
  label,
  placeholder,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-white/60 font-semibold mb-1.5">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm text-white outline-none resize-none focus:border-white/30 placeholder:text-white/30"
      />
    </label>
  );
}

function CleaningPill({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-2 rounded-xl border text-xs font-bold transition-all hover:scale-105"
      style={{
        background: active
          ? `linear-gradient(135deg, ${color}, ${color}dd)`
          : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.7)",
        borderColor: active ? color : "rgba(255,255,255,0.15)",
        boxShadow: active ? `0 4px 16px ${color}55` : "none",
      }}
    >
      {children}
    </button>
  );
}

function ClosingBoxOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative" style={{ width: 280, height: 280, perspective: 800 }}>
        {/* Box base */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, #d4a574, #8b6f47)",
            boxShadow:
              "inset 0 -8px 24px rgba(0,0,0,0.4), 0 16px 48px rgba(0,0,0,0.6)",
          }}
        />
        {/* Box top flap (animates closing) */}
        <div
          className="box-flap-top absolute"
          style={{
            top: 0,
            left: 0,
            right: 0,
            height: "50%",
            background: "linear-gradient(135deg, #e8c096, #b08a5e)",
            borderRadius: "1rem 1rem 0 0",
            boxShadow: "0 -4px 12px rgba(0,0,0,0.3)",
          }}
        />
        {/* Tape */}
        <div
          className="absolute"
          style={{
            top: "calc(50% - 8px)",
            left: 30,
            right: 30,
            height: 16,
            background:
              "repeating-linear-gradient(45deg, #e8d8b0, #e8d8b0 6px, #d4c094 6px, #d4c094 12px)",
            opacity: 0,
            animation: "tapeIn 0.4s ease 1.2s forwards",
          }}
        />
        <style>{`
          @keyframes tapeIn {
            from { opacity: 0; transform: scaleX(0.2); }
            to { opacity: 0.85; transform: scaleX(1); }
          }
        `}</style>
      </div>
    </div>
  );
}
