"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Cpu,
  MapPin,
  ScanFace,
  Smartphone,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import * as THREE from "three";
import type { HighlightId } from "./PhoneModel";
import {
  BACK_DESCRIPTIONS,
  CAMERA_DESCRIPTIONS,
  DISPLAY_DESCRIPTIONS,
  FRAMES_DESCRIPTIONS,
  RatingScale,
} from "./RatingScale";

const Canvas = dynamic(
  () => import("@react-three/fiber").then((m) => m.Canvas),
  { ssr: false },
);
const PhoneScene = dynamic(() => import("./PhoneScene"), { ssr: false });
const ModelLoadingOverlay = dynamic(
  () => import("./ModelLoadingOverlay"),
  { ssr: false },
);

type StepId =
  | "display"
  | "back"
  | "cameras"
  | "frames"
  | "cleaning"
  | "damage"
  | "summary";

interface CleaningTourPos {
  pos: [number, number, number];
  highlight: HighlightId;
  caption: string;
  durationMs: number;
}

interface Step {
  id: StepId;
  title: string;
  subtitle: string;
  highlight: HighlightId;
  cameraPos: [number, number, number];
  /** Dla cleaning step: tour po kilku punktach. */
  cleaningTour?: CleaningTourPos[];
}

const STEPS: Step[] = [
  {
    id: "display",
    title: "Stan wyświetlacza",
    subtitle: "Oceń ekran w skali 1–10. Każda ocena ma opis.",
    highlight: "display",
    cameraPos: [0, 0, 5.0],
  },
  {
    id: "back",
    title: "Tylna szybka",
    subtitle: "Oceń stan plecka — pęknięcia, rysy, odkształcenia.",
    highlight: "back",
    cameraPos: [0, 0, -5.0],
  },
  {
    id: "cameras",
    title: "Wyspa aparatów",
    subtitle: "Stan szkiełek obiektywów, ramki wyspy.",
    highlight: "cameras",
    cameraPos: [-1.6, 1.4, -3.4],
  },
  {
    id: "frames",
    title: "Ramki boczne",
    subtitle: "Otarcia, wgniecenia, deformacje krawędzi (model się obraca).",
    highlight: "frames",
    cameraPos: [4.6, 0, 1.5],
  },
  {
    id: "cleaning",
    title: "Czyszczenie urządzenia",
    subtitle:
      "Pył w głośnikach i porcie często powoduje problemy. Pokażemy co warto wyczyścić — jedna decyzja na końcu.",
    highlight: null,
    cameraPos: [0, 0, 5.0],
    cleaningTour: [
      {
        pos: [0, 4.0, 1.6],
        highlight: "earpiece",
        caption: "Głośnik rozmów — pył przyczynia się do problemów ze słyszalnością",
        durationMs: 7200,
      },
      {
        pos: [0, -4.0, 1.6],
        highlight: "speakers",
        caption: "Głośniczki dolne — kurz tłumi dźwięk multimedia",
        durationMs: 7200,
      },
      {
        pos: [0, -4.5, 1.0],
        highlight: "port",
        caption: "Port ładowania — kurz blokuje połączenie z kablem",
        durationMs: 7200,
      },
    ],
  },
  {
    id: "damage",
    title: "Zaznacz uszkodzenia",
    subtitle: "Kliknij na modelu w miejscach uszkodzeń, aby je zarejestrować.",
    highlight: null,
    cameraPos: [0, 0, 4.5],
  },
  {
    id: "summary",
    title: "Podsumowanie",
    subtitle: "Sprawdź wszystko i dodaj uwagi końcowe.",
    highlight: null,
    cameraPos: [0, 0, 4.6],
  },
];

export interface DamageMarker {
  id: string;
  x: number;
  y: number;
  z: number;
  surface?: string;
  description?: string;
}

export interface VisualConditionState {
  display_rating?: number;
  display_notes?: string;
  back_rating?: number;
  back_notes?: string;
  camera_rating?: number;
  camera_notes?: string;
  frames_rating?: number;
  frames_notes?: string;
  cleaning_accepted?: boolean;
  damage_markers?: DamageMarker[];
  additional_notes?: string;
}

const STEP_ICONS: Record<StepId, React.ComponentType<{ className?: string }>> = {
  display: Smartphone,
  back: Smartphone,
  cameras: ScanFace,
  frames: Cpu,
  cleaning: Sparkles,
  damage: Target,
  summary: CheckCircle2,
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
  const [state, setState] = useState<VisualConditionState>(
    initial ?? { damage_markers: [] },
  );
  const [closing, setClosing] = useState(false);

  // Cleaning tour state — kiedy jesteśmy w cleaning step, animujemy kolejne pozycje.
  const [tourIdx, setTourIdx] = useState(0);
  const tourTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (step.id !== "cleaning" || !step.cleaningTour) {
      if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
      setTourIdx(0);
      return;
    }
    if (tourIdx < step.cleaningTour.length - 1) {
      tourTimerRef.current = setTimeout(
        () => setTourIdx((i) => i + 1),
        step.cleaningTour[tourIdx].durationMs,
      );
    }
    return () => {
      if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    };
  }, [stepIdx, tourIdx, step]);

  // Damage markers — kliknięcie w model przy step=damage dodaje marker.
  const [pendingMarker, setPendingMarker] = useState<{
    x: number;
    y: number;
    z: number;
    surface: string;
  } | null>(null);

  const onModelClick = (point: THREE.Vector3, surface: string) => {
    if (step.id !== "damage") return;
    setPendingMarker({ x: point.x, y: point.y, z: point.z, surface });
  };

  const confirmMarker = (description: string) => {
    if (!pendingMarker) return;
    const m: DamageMarker = {
      id: `m-${Date.now()}`,
      x: pendingMarker.x,
      y: pendingMarker.y,
      z: pendingMarker.z,
      surface: pendingMarker.surface,
      description: description.trim() || undefined,
    };
    setState((s) => ({
      ...s,
      damage_markers: [...(s.damage_markers ?? []), m],
    }));
    setPendingMarker(null);
  };

  const removeMarker = (id: string) => {
    setState((s) => ({
      ...s,
      damage_markers: (s.damage_markers ?? []).filter((m) => m.id !== id),
    }));
  };

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
    // Fade-out editora — bez box animation. Czas dopasowany do CSS transition.
    setTimeout(() => onComplete(state), 700);
  };

  const StepIcon = STEP_ICONS[step.id];
  const update = (patch: Partial<VisualConditionState>) =>
    setState((s) => ({ ...s, ...patch }));

  // Compute current camera + highlight (cleaning tour overrides static step.cameraPos).
  const currentCameraPos: [number, number, number] =
    step.id === "cleaning" && step.cleaningTour
      ? step.cleaningTour[tourIdx].pos
      : step.cameraPos;
  const currentHighlight: HighlightId =
    step.id === "cleaning" && step.cleaningTour
      ? step.cleaningTour[tourIdx].highlight
      : step.highlight;

  return (
    <div
      className={`fixed inset-0 z-[2050] flex flex-col transition-opacity duration-700 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
      style={{
        background:
          "radial-gradient(circle at 50% 30%, #1a2138 0%, #0a0e1a 80%)",
      }}
    >
      <div
        className={`flex-1 flex flex-col transition-all duration-700 ${
          closing ? "scale-95 opacity-0 blur-sm" : "scale-100 opacity-100"
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
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr,minmax(340px,440px)] gap-0 min-h-0">
          <div className="relative" style={{ minHeight: 360 }}>
            <Canvas
              shadows
              camera={{ position: [0, 0, 5.2], fov: 36 }}
              dpr={[1, 2]}
              gl={{
                antialias: true,
                toneMapping: THREE.ACESFilmicToneMapping,
                outputColorSpace: THREE.SRGBColorSpace,
              }}
              onPointerMissed={() => setPendingMarker(null)}
            >
              <PhoneScene
                highlight={currentHighlight}
                cameraPos={currentCameraPos}
                brandColor={brandColorHex}
                isFramesStep={step.id === "frames"}
                screenOn={step.id === "summary"}
                damageMarkers={state.damage_markers ?? []}
                damageMode={step.id === "damage"}
                onModelClick={onModelClick}
              />
            </Canvas>
            <ModelLoadingOverlay />

            {/* Cleaning tour caption overlay */}
            {step.id === "cleaning" && step.cleaningTour && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs text-white/90 max-w-[80%] text-center animate-fade-in">
                <Sparkles className="w-3 h-3 inline mr-1.5 text-amber-400" />
                {step.cleaningTour[tourIdx].caption}
              </div>
            )}

            {/* Damage mode hint */}
            {step.id === "damage" && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-md border border-amber-500/40 text-xs text-amber-300 animate-fade-in">
                <CircleDot className="w-3 h-3 inline mr-1.5" />
                Kliknij w model w miejscu uszkodzenia, aby dodać marker
              </div>
            )}

            {/* Summary screen overlay (HTML on top of phone display) */}
            {step.id === "summary" && (
              <SummaryOverlay
                state={state}
                cleaningPrice={cleaningPrice}
                brand={brand}
              />
            )}

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
              pendingMarker={pendingMarker}
              onChange={update}
              onConfirmMarker={confirmMarker}
              onCancelMarker={() => setPendingMarker(null)}
              onRemoveMarker={removeMarker}
            />
          </div>
        </div>

        {/* Bottom bar */}
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
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  background:
                    i === stepIdx
                      ? "#fff"
                      : i < stepIdx
                        ? "#22C55E"
                        : "rgba(255,255,255,0.2)",
                  width: i === stepIdx ? "1.5rem" : "0.375rem",
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

    </div>
  );
}

function StepInputs({
  step,
  state,
  cleaningPrice,
  pendingMarker,
  onChange,
  onConfirmMarker,
  onCancelMarker,
  onRemoveMarker,
}: {
  step: Step;
  state: VisualConditionState;
  cleaningPrice: number | null;
  pendingMarker: { x: number; y: number; z: number; surface: string } | null;
  onChange: (patch: Partial<VisualConditionState>) => void;
  onConfirmMarker: (description: string) => void;
  onCancelMarker: () => void;
  onRemoveMarker: (id: string) => void;
}) {
  if (step.id === "display") {
    return (
      <div className="space-y-3">
        <RatingScale
          label="Ocena ekranu"
          value={state.display_rating}
          onChange={(v) => onChange({ display_rating: v })}
          descriptions={DISPLAY_DESCRIPTIONS}
        />
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
      <div className="space-y-3">
        <RatingScale
          label="Ocena tylnej szybki"
          value={state.back_rating}
          onChange={(v) => onChange({ back_rating: v })}
          descriptions={BACK_DESCRIPTIONS}
        />
        <NotesField
          label="Tył — uwagi"
          value={state.back_notes ?? ""}
          onChange={(v) => onChange({ back_notes: v })}
        />
      </div>
    );
  }
  if (step.id === "cameras") {
    return (
      <div className="space-y-3">
        <RatingScale
          label="Ocena wyspy aparatów"
          value={state.camera_rating}
          onChange={(v) => onChange({ camera_rating: v })}
          descriptions={CAMERA_DESCRIPTIONS}
        />
        <NotesField
          label="Wyspa aparatów — uwagi"
          value={state.camera_notes ?? ""}
          onChange={(v) => onChange({ camera_notes: v })}
        />
      </div>
    );
  }
  if (step.id === "frames") {
    return (
      <div className="space-y-3">
        <RatingScale
          label="Ocena ramek"
          value={state.frames_rating}
          onChange={(v) => onChange({ frames_rating: v })}
          descriptions={FRAMES_DESCRIPTIONS}
        />
        <NotesField
          label="Ramki boczne — uwagi"
          value={state.frames_notes ?? ""}
          onChange={(v) => onChange({ frames_notes: v })}
        />
      </div>
    );
  }
  if (step.id === "cleaning") {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white/90 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Profesjonalne czyszczenie urządzenia
          </p>
          <p className="text-xs text-white/70 mb-3">
            Jedna usługa, która obejmuje wszystkie miejsca pokazane wyżej:
            głośnik rozmów, głośniczki dolne i port ładowania
            {cleaningPrice != null ? (
              <>
                {" "}— <strong className="text-amber-400">{cleaningPrice} PLN</strong>
              </>
            ) : null}
            .
          </p>
          <div className="flex gap-2">
            <CleaningPill
              active={state.cleaning_accepted === false}
              color="#EF4444"
              onClick={() => onChange({ cleaning_accepted: false })}
            >
              Pomiń
            </CleaningPill>
            <CleaningPill
              active={state.cleaning_accepted === true}
              color="#22C55E"
              onClick={() => onChange({ cleaning_accepted: true })}
            >
              Tak, dodaj usługę
            </CleaningPill>
          </div>
        </div>
      </div>
    );
  }
  if (step.id === "damage") {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs uppercase tracking-wider text-white/60 font-semibold mb-1">
            Markery uszkodzeń
          </p>
          <p className="text-xs text-white/60 mb-2">
            {(state.damage_markers ?? []).length === 0
              ? "Brak — kliknij na modelu w miejscu uszkodzenia."
              : `${(state.damage_markers ?? []).length} marker(ów)`}
          </p>
          <div className="space-y-1.5">
            {(state.damage_markers ?? []).map((m, idx) => (
              <div
                key={m.id}
                className="flex items-start gap-2 p-2 rounded-lg bg-white/5"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase text-white/50 mb-0.5">
                    {m.surface ?? "powierzchnia"}
                  </p>
                  <p className="text-xs text-white/80 truncate">
                    {m.description ?? "(brak opisu)"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveMarker(m.id)}
                  className="p-1 rounded hover:bg-white/10 text-white/60"
                  aria-label="Usuń marker"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
        {pendingMarker && (
          <PendingMarkerEditor
            surface={pendingMarker.surface}
            onConfirm={onConfirmMarker}
            onCancel={onCancelMarker}
          />
        )}
      </div>
    );
  }
  if (step.id === "summary") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-white/60">
          Po prawej widzisz podgląd zapisanych ocen. Dodaj końcowe uwagi
          poniżej, jeśli coś jeszcze chcesz zaznaczyć.
        </p>
        <NotesField
          label="Dodatkowe uwagi"
          value={state.additional_notes ?? ""}
          onChange={(v) => onChange({ additional_notes: v })}
          rows={5}
        />
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

function PendingMarkerEditor({
  surface,
  onConfirm,
  onCancel,
}: {
  surface: string;
  onConfirm: (description: string) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState("");
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="w-4 h-4 text-amber-400" />
        <p className="text-xs uppercase tracking-wider text-amber-300 font-semibold">
          Nowy marker · {surface}
        </p>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Opisz uszkodzenie (np. głębokie pęknięcie 3 cm, wgniecenie)"
        rows={2}
        autoFocus
        className="w-full px-3 py-2 rounded-xl border border-amber-500/30 bg-black/30 text-sm text-white outline-none resize-none focus:border-amber-400 placeholder:text-white/30"
      />
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-white/15 text-white/70 hover:bg-white/5"
        >
          Anuluj
        </button>
        <button
          type="button"
          onClick={() => onConfirm(description)}
          className="flex-1 py-1.5 rounded-lg text-xs font-bold"
          style={{
            background: "linear-gradient(135deg, #F59E0B, #D97706)",
            color: "#fff",
          }}
        >
          Zapisz marker
        </button>
      </div>
    </div>
  );
}

/** Półprzezroczysty overlay HTML pokazujący podsumowanie na "włączonym" ekranie. */
function SummaryOverlay({
  state,
  cleaningPrice,
  brand,
}: {
  state: VisualConditionState;
  cleaningPrice: number | null;
  brand: string;
}) {
  const totalCleaning =
    state.cleaning_accepted && cleaningPrice ? cleaningPrice : 0;
  const ratings = [
    { label: "Ekran", value: state.display_rating },
    { label: "Tył", value: state.back_rating },
    { label: "Aparaty", value: state.camera_rating },
    { label: "Ramki", value: state.frames_rating },
  ].filter((r) => r.value != null);
  const avg =
    ratings.length > 0
      ? Math.round(
          (ratings.reduce((a, b) => a + (b.value as number), 0) /
            ratings.length) *
            10,
        ) / 10
      : null;

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div
        className="rounded-[28px] border border-white/10 backdrop-blur-md shadow-2xl px-5 py-4"
        style={{
          width: 230,
          minHeight: 480,
          background:
            "linear-gradient(180deg, rgba(15, 23, 50, 0.85), rgba(8, 12, 30, 0.85))",
          color: "white",
        }}
      >
        <div className="text-center mb-3 pt-2">
          <p className="text-[10px] uppercase tracking-widest text-white/50">
            {brand}
          </p>
          <p className="text-lg font-bold mt-0.5">Podsumowanie</p>
        </div>
        {avg != null && (
          <div
            className="rounded-xl p-3 text-center mb-3"
            style={{
              background:
                "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05))",
              borderLeft: "3px solid #22c55e",
            }}
          >
            <p className="text-[10px] uppercase text-white/60">Średnia ocena</p>
            <p className="text-3xl font-bold text-emerald-400 mt-0.5">{avg}<span className="text-sm text-white/50">/10</span></p>
          </div>
        )}
        <div className="space-y-1.5 mb-3">
          {ratings.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-white/70">{r.label}</span>
              <span className="font-mono font-bold">{r.value}/10</span>
            </div>
          ))}
        </div>
        {(state.damage_markers ?? []).length > 0 && (
          <div className="text-xs text-white/70 border-t border-white/10 pt-2 mb-2">
            <span className="text-amber-400 font-semibold">
              {(state.damage_markers ?? []).length}
            </span>{" "}
            marker(ów) uszkodzeń
          </div>
        )}
        {state.cleaning_accepted && (
          <div className="text-xs text-emerald-400 border-t border-white/10 pt-2">
            ✓ Czyszczenie:{" "}
            <strong>+{totalCleaning} PLN</strong>
          </div>
        )}
      </div>
    </div>
  );
}

