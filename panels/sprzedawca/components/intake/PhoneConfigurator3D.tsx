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
import { PhoneSceneErrorBoundary } from "./PhoneSceneErrorBoundary";

type StepId =
  | "display"
  | "back"
  | "frames"
  | "cameras"
  | "liquid"
  | "cleaning"
  | "damage"
  | "summary";

interface CleaningTourPos {
  pos: [number, number, number];
  lookAt?: [number, number, number];
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
  cameraLookAt?: [number, number, number];
  cleaningTour?: CleaningTourPos[];
  /** Target rotacja telefonu wokół osi Y (radiany). Domyślnie 0.
   *  display=0, back=π → flip 180° między krokami. */
  phoneRotationY?: number;
}

// Display → back przez OBRÓT telefonu (kamera stoi w +X, telefon flipuje się
// 180° wokół osi Y między krokami). Pozostałe stepy mają phoneRotationY=0.
// Cameras/speakers/port — przywrócone stare pozycje sprzed P17 (działały).
const STEPS: Step[] = [
  {
    id: "display",
    title: "Stan wyświetlacza",
    subtitle: "Oceń ekran w skali 1–10.",
    highlight: "display",
    cameraPos: [4.5, 0, 0],
    phoneRotationY: 0,
  },
  {
    id: "back",
    title: "Panel tylny",
    subtitle: "Oceń stan plecka — pęknięcia, rysy, odkształcenia.",
    highlight: "back",
    // Ta sama pozycja kamery co display — telefon obraca się 180° (flip).
    cameraPos: [4.5, 0, 0],
    phoneRotationY: Math.PI,
  },
  {
    id: "frames",
    title: "Ramki boczne",
    subtitle: "Kamera orbituje wokół telefonu — obejrzyj wszystkie krawędzie.",
    highlight: "frames",
    // Initial pos — orbit handle'owany w PhoneScene.
    cameraPos: [0, 0, 6.0],
  },
  {
    id: "cameras",
    title: "Wyspa aparatów",
    subtitle: "Stan szkiełek obiektywów, ramki wyspy.",
    highlight: "cameras",
    // STARA pozycja sprzed P17 — działała.
    cameraPos: [-1.4, 1.3, -2.8],
    cameraLookAt: [-0.5, 0.8, 0],
  },
  {
    id: "liquid",
    title: "Test funkcjonalny",
    subtitle: "Zalanie, ładowanie",
    highlight: null,
    // Widok dolnej krawędzi z portem ładowania.
    cameraPos: [0, -3.5, 0.6],
    cameraLookAt: [0, -1.6, 0],
  },
  {
    id: "cleaning",
    title: "Czyszczenie urządzenia",
    subtitle:
      "Kurz w głośnikach i porcie powoduje problemy. Jedna usługa — pokażemy gdzie czyścimy.",
    highlight: null,
    cameraPos: [4.0, 0, 0],
    cleaningTour: [
      {
        // Earpiece — góra telefonu (+Y) z lekkim przesunięciem do przodu (+X).
        pos: [2.5, 2.8, 0],
        lookAt: [0.5, 1.4, 0],
        highlight: "earpiece",
        caption: "Głośnik rozmów — pył przyczynia się do problemów ze słyszalnością",
        durationMs: 10000,
      },
      {
        pos: [0, -3.0, 1.4],
        lookAt: [0, -1.4, 0],
        highlight: "speakers",
        caption: "Głośniczki dolne — kurz tłumi dźwięk multimedia",
        durationMs: 10000,
      },
      {
        pos: [0, -3.5, 0.6],
        lookAt: [0, -1.6, 0],
        highlight: "port",
        caption: "Port ładowania — kurz blokuje połączenie z kablem",
        durationMs: 10000,
      },
    ],
  },
  {
    id: "damage",
    title: "Zaznacz uszkodzenia",
    subtitle:
      "Obróć telefon i kliknij w miejscu uszkodzenia. Marker pojawi się natychmiast.",
    highlight: null,
    // Z PRZODU (+X) — wyświetlacz do kamery — z FOV 45 i dist 5.5 telefon się
    // mieści w kadrze.
    cameraPos: [5.5, 0, 0],
    phoneRotationY: 0,
  },
  {
    id: "summary",
    title: "Podsumowanie",
    subtitle: "Sprawdź zapisane oceny i dodaj uwagi końcowe.",
    highlight: null,
    cameraPos: [5.5, 1.5, 4.0],
    cameraLookAt: [-1.8, 0, 0],
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
  // Visual ratings
  display_rating?: number;
  display_notes?: string;
  back_rating?: number;
  back_notes?: string;
  camera_rating?: number;
  camera_notes?: string;
  frames_rating?: number;
  frames_notes?: string;
  // Cleaning + markers + final notes
  cleaning_accepted?: boolean;
  damage_markers?: DamageMarker[];
  additional_notes?: string;
  // === Checklist questions (przeniesione z osobnej sekcji) ===
  /** Czy urządzenie się włącza? — display step. */
  powers_on?: "yes" | "no" | "vibrates";
  /** Czy ekran pęknięty? — display step. */
  cracked_front?: boolean;
  /** Czy panel tylny pęknięty? — back step. */
  cracked_back?: boolean;
  /** Czy obudowa wygięta? — frames step. */
  bent?: boolean;
  /** Apple-only: czy Face ID/Touch ID działa? — display step. */
  face_touch_id?: boolean;
  /** Czy zalany? — liquid step. */
  water_damage?: "yes" | "no" | "unknown";
  /** Prąd ładowania w amperach — liquid step (gdy water_damage = "no"). */
  charging_current?: number;
}

/** Detekcja platformy + zwrot profesjonalnej instrukcji obracania modelem. */
function getRotationInstruction(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  if (isMobile) {
    return "Jeden palec — obrót, dwa palce — przybliżenie.";
  }
  const isMac = /Mac|Macintosh/i.test(ua);
  if (isMac) {
    return "Trackpad: jeden palec — obrót, ścisk dwoma palcami — przybliżenie.";
  }
  return "Przeciągnij lewym przyciskiem myszy aby obrócić, scroll aby przybliżyć.";
}

/** Polskie etykiety nazw powierzchni dla markerów. */
const SURFACE_LABELS: Record<string, string> = {
  display: "Wyświetlacz",
  back: "Panel tylny",
  cameras: "Wyspa aparatów",
  frames: "Ramki boczne",
  earpiece: "Głośnik rozmów",
  speakers: "Głośniczki dolne",
  port: "Port ładowania",
  frame: "Ramka",
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
    // Loop infinity — port → earpiece → speakers → port → earpiece → ...
    const len = step.cleaningTour.length;
    tourTimerRef.current = setTimeout(
      () => setTourIdx((i) => (i + 1) % len),
      step.cleaningTour[tourIdx].durationMs,
    );
    return () => {
      if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    };
  }, [stepIdx, tourIdx, step]);

  // Damage markers — kliknięcie w model NATYCHMIAST tworzy marker (bez
  // dodatkowego "Zapisz" buttona). User może potem edytować opis w panelu
  // bocznym albo usunąć krzyżykiem.
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  // Pending choice — gdy klik trafia w boundary między strefami, popup z wyborem.
  const [pendingChoice, setPendingChoice] = useState<{
    x: number;
    y: number;
    z: number;
    candidates: string[];
  } | null>(null);

  const addMarker = (
    point: { x: number; y: number; z: number },
    surface: string,
  ) => {
    const m: DamageMarker = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      x: point.x,
      y: point.y,
      z: point.z,
      surface,
      description: "",
    };
    setState((s) => ({
      ...s,
      damage_markers: [...(s.damage_markers ?? []), m],
    }));
    setEditingMarkerId(m.id);
  };

  const onModelClick = (point: THREE.Vector3, candidates: string[]) => {
    if (step.id !== "damage") return;
    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      addMarker(point, candidates[0]);
      return;
    }
    // Multi-candidate (boundary case) — popup wyboru.
    setPendingChoice({
      x: point.x,
      y: point.y,
      z: point.z,
      candidates,
    });
  };

  const confirmZoneChoice = (choice: string) => {
    if (!pendingChoice) return;
    addMarker(
      { x: pendingChoice.x, y: pendingChoice.y, z: pendingChoice.z },
      choice,
    );
    setPendingChoice(null);
  };

  const updateMarkerDescription = (id: string, description: string) => {
    setState((s) => ({
      ...s,
      damage_markers: (s.damage_markers ?? []).map((m) =>
        m.id === id ? { ...m, description } : m,
      ),
    }));
  };

  const removeMarker = (id: string) => {
    setState((s) => ({
      ...s,
      damage_markers: (s.damage_markers ?? []).filter((m) => m.id !== id),
    }));
    if (editingMarkerId === id) setEditingMarkerId(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // canGoNext + state zawarte w deps — bez tego next() captured był ze
    // stale canGoNext (po pierwszym renderze), co pozwalało skipować kroki.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, state, brand]);

  const isStepComplete = (s: Step): boolean => {
    switch (s.id) {
      case "display":
        if (state.display_rating == null) return false;
        if (state.powers_on == null) return false;
        if (state.cracked_front == null) return false;
        // Face/Touch ID tylko dla Apple.
        if (
          brand.toLowerCase() === "apple" &&
          state.face_touch_id == null
        ) {
          return false;
        }
        return true;
      case "back":
        if (state.back_rating == null) return false;
        if (state.cracked_back == null) return false;
        return true;
      case "frames":
        if (state.frames_rating == null) return false;
        if (state.bent == null) return false;
        return true;
      case "cameras":
        return state.camera_rating != null;
      case "liquid":
        if (state.water_damage == null) return false;
        // Prąd ładowania wymagany tylko gdy water_damage = "no".
        if (state.water_damage === "no" && state.charging_current == null) {
          return false;
        }
        return true;
      case "cleaning":
        return state.cleaning_accepted != null;
      case "damage":
        return true; // markery opcjonalne
      case "summary":
        return true;
      default:
        return false;
    }
  };
  const canGoNext = isStepComplete(step);
  const next = () => {
    if (!canGoNext) return;
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const prev = () => setStepIdx((i) => Math.max(i - 1, 0));

  const finish = () => {
    setClosing(true);
    // Fade-out editora — bez box animation. Czas dopasowany do CSS transition.
    setTimeout(() => onComplete(state), 700);
  };

  const update = (patch: Partial<VisualConditionState>) =>
    setState((s) => ({ ...s, ...patch }));

  // Compute current camera + highlight (cleaning tour overrides static step.cameraPos).
  const currentCameraPos: [number, number, number] =
    step.id === "cleaning" && step.cleaningTour
      ? step.cleaningTour[tourIdx].pos
      : step.cameraPos;
  const currentLookAt: [number, number, number] | undefined =
    step.id === "cleaning" && step.cleaningTour
      ? step.cleaningTour[tourIdx].lookAt
      : step.cameraLookAt;
  const currentHighlight: HighlightId =
    step.id === "cleaning" && step.cleaningTour
      ? step.cleaningTour[tourIdx].highlight
      : step.highlight;
  const phonePosition: [number, number, number] =
    step.id === "summary" ? [-1.8, 0, 0] : [0, 0, 0];
  const playDisassembly = step.id === "summary";

  // Inconsistencies (sprzeczne dane). Blokujemy "Kontynuuj" gdy są errors;
  // warns nie blokują, tylko ostrzegają.
  const summaryIssues =
    step.id === "summary" ? getInconsistencies(state, brand) : [];
  const hasBlockingErrors = summaryIssues.some((i) => i.kind === "error");

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
        {/* Top bar — minimalist: tylko tytuł + close button */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-black/30 backdrop-blur-md border-b border-white/10">
          <p className="text-white text-base font-semibold truncate">
            {step.title}
          </p>
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

        {/* Main canvas — absolute positioning dla maksymalnej kontroli.
            Canvas zajmuje pełen obszar (lg: minus right 420px na panel).
            Panel: bottom 45vh (mobile) / right 420px (desktop), zawsze
            overflow-y-auto z eksplicytnym wymiarem → scroll niezawodnie
            działa. */}
        <div className="flex-1 relative min-h-0 overflow-hidden">
          <div className="absolute left-0 right-0 top-0 bottom-[45vh] lg:bottom-0 lg:right-[420px]">
            <PhoneSceneErrorBoundary>
              <Canvas
                camera={{ position: [4.5, 0, 0], fov: 45 }}
                dpr={[1, 2]}
                gl={{
                  antialias: true,
                  toneMapping: THREE.ACESFilmicToneMapping,
                  outputColorSpace: THREE.SRGBColorSpace,
                }}
                onCreated={({ gl }) => {
                  gl.domElement.addEventListener("webglcontextlost", (e) => {
                    e.preventDefault();
                    console.error("[Canvas] WebGL context lost");
                  });
                }}
                onPointerMissed={() => setEditingMarkerId(null)}
              >
                <PhoneScene
                  highlight={currentHighlight}
                  cameraPos={currentCameraPos}
                  cameraLookAt={currentLookAt}
                  brandColor={brandColorHex}
                  isFramesStep={step.id === "frames"}
                  isCleaningStep={step.id === "cleaning"}
                  screenOn={false}
                  damageMarkers={state.damage_markers ?? []}
                  damageMode={step.id === "damage"}
                  playDisassembly={playDisassembly}
                  phonePosition={phonePosition}
                  phoneRotationY={step.phoneRotationY ?? 0}
                  onModelClick={onModelClick}
                />
              </Canvas>
            </PhoneSceneErrorBoundary>
            <ModelLoadingOverlay />

            {/* Cleaning tour caption overlay */}
            {step.id === "cleaning" && step.cleaningTour && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs text-white/90 max-w-[80%] text-center animate-fade-in">
                <Sparkles className="w-3 h-3 inline mr-1.5 text-amber-400" />
                {step.cleaningTour[tourIdx].caption}
              </div>
            )}

            {/* Damage mode hint — instrukcje zależne od platformy. */}
            {step.id === "damage" && !pendingChoice && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-2xl bg-black/70 backdrop-blur-md border border-amber-500/40 text-xs text-amber-200 animate-fade-in max-w-[90%] text-center space-y-1">
                <div className="flex items-center justify-center gap-1.5">
                  <CircleDot className="w-3 h-3 text-amber-400" />
                  <span className="font-semibold">
                    Kliknij w model w miejscu uszkodzenia
                  </span>
                </div>
                <div className="text-[11px] text-white/70">
                  {getRotationInstruction()}
                </div>
              </div>
            )}

            {/* Boundary zone choice popup — gdy klik blisko granicy stref. */}
            {pendingChoice && (
              <div className="absolute inset-0 z-[10] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4">
                <div className="bg-[#1a2138] rounded-2xl border border-white/15 shadow-2xl p-4 max-w-sm w-full">
                  <p className="text-sm font-semibold text-white mb-1">
                    Której części dotyczy uszkodzenie?
                  </p>
                  <p className="text-xs text-white/60 mb-3">
                    Klik blisko granicy — wybierz właściwy obszar.
                  </p>
                  <div className="space-y-1.5">
                    {pendingChoice.candidates.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => confirmZoneChoice(c)}
                        className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm text-white text-left hover:bg-white/10 hover:border-amber-500/40 transition-colors"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingChoice(null)}
                    className="w-full mt-2 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white/90 transition-colors"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step controls panel — absolute. Mobile: bottom 45vh. Desktop:
              right 420px, full height. overflow-y-auto + eksplicytny rozmiar
              = niezawodny scroll w obu trybach. */}
          <aside
            className="absolute left-0 right-0 bottom-0 h-[45vh] lg:left-auto lg:top-0 lg:right-0 lg:bottom-0 lg:h-auto lg:w-[420px] overflow-y-auto bg-white/5 backdrop-blur-md border-t lg:border-t-0 lg:border-l border-white/10 p-4"
            style={{ overscrollBehavior: "contain" }}
          >
            <StepInputs
              step={step}
              state={state}
              brand={brand}
              cleaningPrice={cleaningPrice}
              editingMarkerId={editingMarkerId}
              onChange={update}
              onUpdateMarkerDescription={updateMarkerDescription}
              onSelectMarker={setEditingMarkerId}
              onRemoveMarker={removeMarker}
            />
          </aside>
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
              disabled={!canGoNext}
              title={!canGoNext ? "Uzupełnij wymagane pole tego kroku" : undefined}
              className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: canGoNext
                  ? "linear-gradient(135deg, #3B82F6, #A855F7)"
                  : "rgba(100,100,120,0.5)",
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
              disabled={hasBlockingErrors}
              title={
                hasBlockingErrors
                  ? "Uzupełnij wymagane dane oznaczone na czerwono"
                  : undefined
              }
              className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: hasBlockingErrors
                  ? "rgba(100,100,120,0.5)"
                  : "linear-gradient(135deg, #22C55E, #16A34A)",
                color: "#fff",
              }}
            >
              Kontynuuj
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
  brand,
  cleaningPrice,
  editingMarkerId,
  onChange,
  onUpdateMarkerDescription,
  onSelectMarker,
  onRemoveMarker,
}: {
  step: Step;
  state: VisualConditionState;
  brand: string;
  cleaningPrice: number | null;
  editingMarkerId: string | null;
  onChange: (patch: Partial<VisualConditionState>) => void;
  onUpdateMarkerDescription: (id: string, description: string) => void;
  onSelectMarker: (id: string | null) => void;
  onRemoveMarker: (id: string) => void;
}) {
  if (step.id === "display") {
    return (
      <div className="space-y-4">
        <SectionHeader>Ocena ekranu</SectionHeader>
        <RatingScale
          value={state.display_rating}
          onChange={(v) => onChange({ display_rating: v })}
          descriptions={DISPLAY_DESCRIPTIONS}
        />
        <SectionHeader>Test funkcjonalny</SectionHeader>
        <ChoicePicker
          label="Czy urządzenie się włącza?"
          value={state.powers_on}
          options={[
            { value: "yes", label: "Tak", color: "#22C55E" },
            { value: "no", label: "Nie", color: "#EF4444" },
            {
              value: "vibrates",
              label: "Wibruje / dźwięk, ale ekran nie reaguje",
              color: "#F59E0B",
            },
          ]}
          onChange={(v) =>
            onChange({ powers_on: v as "yes" | "no" | "vibrates" })
          }
        />
        <BoolPicker
          label="Czy ekran jest pęknięty?"
          value={state.cracked_front}
          onChange={(v) => onChange({ cracked_front: v })}
        />
        {brand.toLowerCase() === "apple" && (
          <BoolPicker
            label="Czy Face ID / Touch ID działa?"
            value={state.face_touch_id}
            onChange={(v) => onChange({ face_touch_id: v })}
            invertColors
          />
        )}
      </div>
    );
  }
  if (step.id === "back") {
    return (
      <div className="space-y-4">
        <SectionHeader>Ocena panelu tylnego</SectionHeader>
        <RatingScale
          value={state.back_rating}
          onChange={(v) => onChange({ back_rating: v })}
          descriptions={BACK_DESCRIPTIONS}
        />
        <SectionHeader>Test funkcjonalny</SectionHeader>
        <BoolPicker
          label="Czy panel tylny jest pęknięty?"
          value={state.cracked_back}
          onChange={(v) => onChange({ cracked_back: v })}
        />
      </div>
    );
  }
  if (step.id === "cameras") {
    return (
      <div className="space-y-4">
        <SectionHeader>Ocena wyspy aparatów</SectionHeader>
        <RatingScale
          value={state.camera_rating}
          onChange={(v) => onChange({ camera_rating: v })}
          descriptions={CAMERA_DESCRIPTIONS}
        />
      </div>
    );
  }
  if (step.id === "frames") {
    return (
      <div className="space-y-4">
        <SectionHeader>Ocena ramek</SectionHeader>
        <RatingScale
          value={state.frames_rating}
          onChange={(v) => onChange({ frames_rating: v })}
          descriptions={FRAMES_DESCRIPTIONS}
        />
        <SectionHeader>Test funkcjonalny</SectionHeader>
        <BoolPicker
          label="Czy obudowa jest wygięta?"
          value={state.bent}
          onChange={(v) => onChange({ bent: v })}
        />
      </div>
    );
  }
  if (step.id === "liquid") {
    const showCharging =
      state.water_damage === undefined || state.water_damage === "no";
    return (
      <div className="space-y-4">
        <SectionHeader>Test funkcjonalny</SectionHeader>
        <ChoicePicker
          label="Czy urządzenie było zalane?"
          value={state.water_damage}
          options={[
            { value: "no", label: "Nie", color: "#22C55E" },
            { value: "yes", label: "Tak", color: "#EF4444" },
            { value: "unknown", label: "Nie wiadomo", color: "#F59E0B" },
          ]}
          onChange={(v) =>
            onChange({ water_damage: v as "yes" | "no" | "unknown" })
          }
        />
        {showCharging ? (
          <ChargingCurrentInput
            value={state.charging_current}
            onChange={(v) => onChange({ charging_current: v })}
          />
        ) : (
          <div
            className="rounded-xl p-3 border text-xs animate-fade-in"
            style={{
              background: "rgba(245, 158, 11, 0.1)",
              borderColor: "rgba(245, 158, 11, 0.3)",
              color: "rgba(255, 255, 255, 0.85)",
            }}
          >
            <p
              className="font-semibold mb-0.5"
              style={{ color: "#F59E0B" }}
            >
              Pomiar prądu pominięty
            </p>
            <p className="text-white/70">
              Z uwagi na potencjalny kontakt z cieczą podłączenie ładowania
              do diagnostyki może być ryzykowne. Pominięcie tego kroku jest
              zalecane.
            </p>
          </div>
        )}
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
            głośnik rozmów, głośniczki dolne i port ładowania.
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
          {state.cleaning_accepted === true && (
            <div className="mt-3 pt-3 border-t border-white/10 animate-fade-in">
              <div
                className="w-full p-3 rounded-xl border-2"
                style={{
                  background: "rgba(34, 197, 94, 0.12)",
                  borderColor: "#22C55E",
                  color: "#fff",
                }}
              >
                <p className="text-sm font-semibold">Czyszczenie standardowe</p>
                <p className="text-[11px] text-white/60">
                  Głośnik rozmów + głośniczki dolne + port ładowania
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  if (step.id === "damage") {
    const markers = state.damage_markers ?? [];
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs uppercase tracking-wider text-white/60 font-semibold mb-1">
            Markery uszkodzeń ({markers.length})
          </p>
          <p className="text-xs text-white/60 mb-2">
            {markers.length === 0
              ? "Brak — kliknij na modelu w miejscu uszkodzenia."
              : "Kliknij marker żeby edytować opis. Markery są opcjonalne."}
          </p>
          <div className="space-y-1.5">
            {markers.map((m, idx) => (
              <div
                key={m.id}
                className="rounded-lg bg-white/5 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    onSelectMarker(editingMarkerId === m.id ? null : m.id)
                  }
                  className="w-full flex items-start gap-2 p-2 hover:bg-white/5 transition-colors text-left"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase text-white/50 mb-0.5">
                      {SURFACE_LABELS[m.surface ?? ""] ?? m.surface ?? "powierzchnia"}
                    </p>
                    <p className="text-xs text-white/80 truncate">
                      {m.description?.trim() || "(kliknij aby dodać opis)"}
                    </p>
                  </div>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveMarker(m.id);
                    }}
                    className="p-1 rounded hover:bg-white/10 text-white/60"
                    role="button"
                    aria-label="Usuń marker"
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                </button>
                {editingMarkerId === m.id && (
                  <div className="p-2 border-t border-white/10 animate-fade-in">
                    <textarea
                      value={m.description ?? ""}
                      onChange={(e) =>
                        onUpdateMarkerDescription(m.id, e.target.value)
                      }
                      placeholder="Opisz uszkodzenie (np. głębokie pęknięcie 3 cm)"
                      rows={2}
                      autoFocus
                      className="w-full px-2 py-1.5 rounded-lg border border-white/10 bg-black/30 text-xs text-white outline-none resize-none focus:border-amber-400 placeholder:text-white/30"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (step.id === "summary") {
    return (
      <SummaryPanel
        state={state}
        brand={brand}
        cleaningPrice={cleaningPrice}
        onChange={onChange}
      />
    );
  }
  return null;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-white/50 font-semibold pt-1">
      {children}
    </p>
  );
}

/** Toggle Tak/Nie z opcjonalną zamianą kolorów (np. dla "Face ID działa"
 * gdzie Tak = zielone). Domyślnie Tak = czerwone (dla negative questions
 * jak "Czy pęknięty"). */
function BoolPicker({
  label,
  value,
  onChange,
  invertColors = false,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  invertColors?: boolean;
}) {
  const yesColor = invertColors ? "#22C55E" : "#EF4444";
  const noColor = invertColors ? "#EF4444" : "#22C55E";
  return (
    <div>
      <p className="text-sm font-medium text-white/85 mb-2">{label}</p>
      <div className="flex gap-2">
        <PickerOption
          active={value === false}
          color={noColor}
          onClick={() => onChange(false)}
          label="Nie"
          fullWidth
        />
        <PickerOption
          active={value === true}
          color={yesColor}
          onClick={() => onChange(true)}
          label="Tak"
          fullWidth
        />
      </div>
    </div>
  );
}

/** Wybór z 2-3 opcji w formie pełnowątkowych przycisków pod pytaniem. */
function ChoicePicker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: { value: string; label: string; color: string }[];
}) {
  return (
    <div>
      <p className="text-sm font-medium text-white/85 mb-2">{label}</p>
      <div className="flex flex-col gap-1.5">
        {options.map((o) => (
          <PickerOption
            key={o.value}
            active={value === o.value}
            color={o.color}
            onClick={() => onChange(o.value)}
            label={o.label}
            fullWidth
            stack
          />
        ))}
      </div>
    </div>
  );
}

function PickerOption({
  active,
  color,
  onClick,
  label,
  fullWidth,
  stack,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  label: string;
  fullWidth?: boolean;
  stack?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all duration-200 hover:scale-[1.01] ${fullWidth ? "flex-1" : ""} ${stack ? "text-left" : "text-center"}`}
      style={{
        background: active
          ? `linear-gradient(90deg, ${color}33, transparent 70%)`
          : "rgba(255,255,255,0.04)",
        borderColor: active ? color : "rgba(255,255,255,0.1)",
        color: active ? "#fff" : "rgba(255,255,255,0.7)",
        boxShadow: active ? `inset 4px 0 0 ${color}` : "none",
      }}
    >
      {label}
    </button>
  );
}

function ChargingCurrentInput({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="rounded-xl p-3 border border-white/10 bg-white/5">
      <p className="text-sm font-medium text-white/85 mb-1">Prąd ładowania</p>
      <p className="text-[11px] text-white/55 mb-2">
        Zmierz przy podłączeniu ładowarki.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          max="9.99"
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onChange(undefined);
            else {
              const n = Number(v);
              onChange(Number.isFinite(n) ? n : undefined);
            }
          }}
          placeholder="0.00"
          className="w-24 px-3 py-2 rounded-lg border border-white/10 bg-black/30 text-sm text-white outline-none text-right font-mono focus:border-white/30 placeholder:text-white/30"
        />
        <span className="text-sm text-white/65 font-mono">A</span>
      </div>
    </div>
  );
}

/** Render rzeczowych informacji z testu funkcjonalnego (powers_on, cracked,
 * bent, face_id, water_damage, charging_current). Tylko wypełnione pola. */
function ChecklistSummaryBlock({ state }: { state: VisualConditionState }) {
  const items: { label: string; value: string; tone: "ok" | "bad" | "warn" }[] = [];

  if (state.powers_on != null) {
    const labels: Record<string, string> = {
      yes: "Tak",
      no: "Nie",
      vibrates: "Wibruje, ekran nie reaguje",
    };
    items.push({
      label: "Włącza się",
      value: labels[state.powers_on] ?? state.powers_on,
      tone:
        state.powers_on === "yes"
          ? "ok"
          : state.powers_on === "no"
            ? "bad"
            : "warn",
    });
  }
  if (state.cracked_front != null) {
    items.push({
      label: "Pęknięty z przodu",
      value: state.cracked_front ? "Tak" : "Nie",
      tone: state.cracked_front ? "bad" : "ok",
    });
  }
  if (state.cracked_back != null) {
    items.push({
      label: "Pęknięty z tyłu",
      value: state.cracked_back ? "Tak" : "Nie",
      tone: state.cracked_back ? "bad" : "ok",
    });
  }
  if (state.bent != null) {
    items.push({
      label: "Wygięty",
      value: state.bent ? "Tak" : "Nie",
      tone: state.bent ? "bad" : "ok",
    });
  }
  if (state.face_touch_id != null) {
    items.push({
      label: "Face ID / Touch ID działa",
      value: state.face_touch_id ? "Tak" : "Nie",
      tone: state.face_touch_id ? "ok" : "bad",
    });
  }
  if (state.water_damage != null) {
    const labels: Record<string, string> = {
      no: "Nie",
      yes: "Tak",
      unknown: "Nie wiadomo",
    };
    items.push({
      label: "Zalany",
      value: labels[state.water_damage] ?? state.water_damage,
      tone:
        state.water_damage === "no"
          ? "ok"
          : state.water_damage === "yes"
            ? "bad"
            : "warn",
    });
  }
  if (state.charging_current != null) {
    items.push({
      label: "Prąd ładowania",
      value: `${state.charging_current.toFixed(2)} A`,
      tone: "ok",
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl p-3 border border-white/10 bg-white/5">
      <p className="text-[10px] uppercase tracking-wide text-white/60 font-semibold mb-2">
        Test funkcjonalny
      </p>
      <div className="space-y-1">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex items-center justify-between text-xs gap-2"
          >
            <span className="text-white/70">{it.label}</span>
            <span
              className="font-semibold"
              style={{
                color:
                  it.tone === "ok"
                    ? "#22C55E"
                    : it.tone === "bad"
                      ? "#EF4444"
                      : "#F59E0B",
              }}
            >
              {it.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
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

// PendingMarkerEditor usunięte — markery dodają się natychmiast po kliknięciu
// w model, edycja opisu jest inline na liście markerów w panelu prawym.
function _UnusedPendingMarkerEditorPlaceholder() {
  return null;
}

/** Wykrywa logiczne sprzeczności w stanie. Zwraca listę ostrzeżeń —
 * warn (sprzeczne dane, do weryfikacji) lub error (brak wymaganej info).
 * UX: lepiej zatrzymać sprzedawcę przed nielogiczną wyceną niż wpuścić
 * urządzenie z 10/10 + wygięta obudowa. */
function getInconsistencies(
  state: VisualConditionState,
  brand: string,
): { kind: "warn" | "error"; message: string }[] {
  const issues: { kind: "warn" | "error"; message: string }[] = [];

  // Apple bez Face/Touch ID.
  if (brand.toLowerCase() === "apple" && state.face_touch_id == null) {
    issues.push({
      kind: "error",
      message:
        "Brak informacji o Face ID / Touch ID — wymagane dla urządzeń Apple.",
    });
  }

  // Wysokie oceny vs uszkodzenia mechaniczne.
  if (
    state.display_rating != null &&
    state.display_rating >= 8 &&
    state.cracked_front === true
  ) {
    issues.push({
      kind: "warn",
      message: `Pęknięty ekran a ocena wyświetlacza ${state.display_rating}/10 — to się wzajemnie wyklucza, sprawdź ocenę.`,
    });
  }
  if (
    state.back_rating != null &&
    state.back_rating >= 8 &&
    state.cracked_back === true
  ) {
    issues.push({
      kind: "warn",
      message: `Pęknięty panel tylny a ocena ${state.back_rating}/10 — sprawdź ocenę.`,
    });
  }
  if (
    state.frames_rating != null &&
    state.frames_rating >= 8 &&
    state.bent === true
  ) {
    issues.push({
      kind: "warn",
      message: `Wygięta obudowa a ocena ramek ${state.frames_rating}/10 — sprawdź ocenę.`,
    });
  }

  // Niskie oceny bez markera uszkodzeń ani notki.
  const lowRatedNoEvidence =
    [
      ["display_rating", "Wyświetlacz", state.display_rating],
      ["back_rating", "Panel tylny", state.back_rating],
      ["frames_rating", "Ramki boczne", state.frames_rating],
      ["camera_rating", "Wyspa aparatów", state.camera_rating],
    ] as const;
  const hasMarkers = (state.damage_markers ?? []).length > 0;
  for (const [, label, val] of lowRatedNoEvidence) {
    if (val != null && val <= 4 && !hasMarkers && !state.additional_notes?.trim()) {
      issues.push({
        kind: "warn",
        message: `${label} oceniony ${val}/10 ale brak markerów ani notatki — opisz uszkodzenia.`,
      });
      break; // pojedyncze ostrzeżenie wystarczy
    }
  }

  // Powers_on = no — pełna ocena niemożliwa.
  if (state.powers_on === "no") {
    issues.push({
      kind: "warn",
      message:
        "Urządzenie się nie włącza — pełna diagnostyka ekranu/aparatów wymaga uruchomienia po naprawie.",
    });
  }

  // Zalanie — zwiększone ryzyko ukrytych awarii.
  if (state.water_damage === "yes") {
    issues.push({
      kind: "warn",
      message:
        "Urządzenie było zalane — możliwe ukryte uszkodzenia, wycena ma charakter orientacyjny.",
    });
  }

  // Markery bez opisu.
  const emptyDescCount = (state.damage_markers ?? []).filter(
    (m) => !m.description?.trim(),
  ).length;
  if (emptyDescCount > 0) {
    issues.push({
      kind: "warn",
      message: `${emptyDescCount} marker(ów) uszkodzeń bez opisu — uzupełnij szczegóły.`,
    });
  }

  // Ekran pęknięty + ocena bardzo wysoka.
  if (state.cracked_front === true && (state.display_rating ?? 0) >= 9) {
    issues.push({
      kind: "warn",
      message: "Pęknięty ekran nie może mieć oceny 9-10/10.",
    });
  }

  return issues;
}

/** Pełen panel podsumowania w prawej kolumnie summary step. Pokazuje
 * średnią, oceny per element, markery + treść notatek + cleaning total +
 * banner ostrzeżeń o logicznych sprzecznościach. */
function SummaryPanel({
  state,
  brand,
  cleaningPrice,
  onChange,
}: {
  state: VisualConditionState;
  brand: string;
  cleaningPrice: number | null;
  onChange: (patch: Partial<VisualConditionState>) => void;
}) {
  const inconsistencies = getInconsistencies(state, brand);
  const totalCleaning =
    state.cleaning_accepted && cleaningPrice ? cleaningPrice : 0;
  const ratings: {
    label: string;
    value: number | undefined;
    notes?: string;
    descriptions: Record<number, string>;
  }[] = [
    {
      label: "Wyświetlacz",
      value: state.display_rating,
      notes: state.display_notes,
      descriptions: DISPLAY_DESCRIPTIONS,
    },
    {
      label: "Panel tylny",
      value: state.back_rating,
      notes: state.back_notes,
      descriptions: BACK_DESCRIPTIONS,
    },
    {
      label: "Wyspa aparatów",
      value: state.camera_rating,
      notes: state.camera_notes,
      descriptions: CAMERA_DESCRIPTIONS,
    },
    {
      label: "Ramki boczne",
      value: state.frames_rating,
      notes: state.frames_notes,
      descriptions: FRAMES_DESCRIPTIONS,
    },
  ];

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Banner ostrzeżeń o logicznych sprzecznościach. */}
      {inconsistencies.length > 0 && (
        <div
          className="rounded-xl p-3 border space-y-1.5"
          style={{
            background:
              inconsistencies.some((i) => i.kind === "error")
                ? "rgba(239, 68, 68, 0.12)"
                : "rgba(245, 158, 11, 0.12)",
            borderColor: inconsistencies.some((i) => i.kind === "error")
              ? "rgba(239, 68, 68, 0.4)"
              : "rgba(245, 158, 11, 0.4)",
          }}
        >
          <p
            className="text-[10px] uppercase tracking-wide font-semibold"
            style={{
              color: inconsistencies.some((i) => i.kind === "error")
                ? "#FCA5A5"
                : "#FCD34D",
            }}
          >
            {inconsistencies.some((i) => i.kind === "error")
              ? "Wymagane uzupełnienie"
              : "Sprawdź spójność danych"}
          </p>
          <ul className="space-y-1 text-[11px] text-white/85 leading-snug">
            {inconsistencies.map((it, idx) => (
              <li key={idx} className="flex gap-1.5">
                <span
                  className="flex-shrink-0 mt-0.5"
                  style={{
                    color: it.kind === "error" ? "#EF4444" : "#F59E0B",
                  }}
                >
                  •
                </span>
                <span>{it.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        {ratings.map((r) => (
          <div
            key={r.label}
            className="rounded-xl p-3 border border-white/10 bg-white/5"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs uppercase tracking-wide text-white/70 font-semibold">
                {r.label}
              </span>
              <span
                className="font-mono text-base font-bold"
                style={{
                  color:
                    r.value == null
                      ? "rgba(255,255,255,0.3)"
                      : r.value >= 7
                        ? "#22C55E"
                        : r.value >= 5
                          ? "#F59E0B"
                          : "#EF4444",
                }}
              >
                {r.value != null ? `${r.value}/10` : "—"}
              </span>
            </div>
            {r.value != null && r.descriptions[r.value] && (
              <p className="text-[11px] text-white/65 leading-snug">
                {r.descriptions[r.value]}
              </p>
            )}
            {r.notes && (
              <p className="text-[11px] text-white/55 mt-1 italic">
                {r.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      {(state.damage_markers ?? []).length > 0 && (
        <div className="rounded-xl p-3 border border-amber-500/30 bg-amber-500/10">
          <p className="text-[10px] uppercase tracking-wide text-amber-300 font-semibold mb-2">
            Markery uszkodzeń ({(state.damage_markers ?? []).length})
          </p>
          <div className="space-y-1.5">
            {(state.damage_markers ?? []).map((m, i) => (
              <div
                key={m.id}
                className="text-xs text-white/80 flex items-start gap-2"
              >
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase text-white/50">
                    {SURFACE_LABELS[m.surface ?? ""] ?? m.surface ?? "powierzchnia"}
                  </p>
                  <p className="text-[11px]">
                    {m.description?.trim() || "(brak opisu)"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test funkcjonalny — pokazuje wszystkie odpowiedzi z checklisty. */}
      <ChecklistSummaryBlock state={state} />

      {state.cleaning_accepted && (
        <div className="rounded-xl p-3 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
          <span className="text-xs text-emerald-300 font-semibold">
            ✓ Czyszczenie urządzenia
          </span>
          <span className="text-sm font-bold text-emerald-400">
            +{totalCleaning} PLN
          </span>
        </div>
      )}

      <div className="rounded-xl p-3 border border-white/10 bg-white/5">
        <p className="text-[10px] uppercase tracking-wide text-white/60 font-semibold mb-2">
          Dodatkowe uwagi
        </p>
        <textarea
          value={state.additional_notes ?? ""}
          onChange={(e) => onChange({ additional_notes: e.target.value })}
          rows={3}
          placeholder="(opcjonalnie)"
          className="w-full px-2 py-1.5 rounded-lg border border-white/10 bg-black/30 text-xs text-white outline-none resize-none focus:border-white/30 placeholder:text-white/30"
        />
      </div>
    </div>
  );
}

