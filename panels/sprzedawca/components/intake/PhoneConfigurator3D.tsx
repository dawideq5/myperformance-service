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
import type { PhoneAxes } from "./PhoneGLB";
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
}

// Pozycje kamery dopasowane do auto-skalowanego modelu (max dim ~3.5 jednostek).
// Telefon zorientowany: ekran → +Z, tył → -Z, góra (głośnik rozmów) → +Y,
// dół (port + speakers) → -Y, ramki boczne → ±X.
const STEPS: Step[] = [
  {
    id: "display",
    title: "Stan wyświetlacza",
    subtitle: "Oceń ekran w skali 1–10.",
    highlight: "display",
    cameraPos: [0, 0, 4.0],
  },
  {
    id: "back",
    title: "Tylna szybka",
    // Bardziej dramatyczny back-down angle — pokazuje plecek + lekki kąt do dołu
    // żeby uniknąć view zdominowanego przez ramki.
    subtitle: "Oceń stan plecka — pęknięcia, rysy, odkształcenia.",
    highlight: "back",
    cameraPos: [0.3, -0.6, -3.0],
    cameraLookAt: [0, 0.2, 0],
  },
  {
    id: "frames",
    title: "Ramki boczne",
    // Frames step: kamera orbituje wokół telefonu (PhoneScene.useFrame manual)
    // — telefon stoi nieruchomo, widzimy kolejno wszystkie krawędzie.
    subtitle: "Kamera orbituje wokół ramek — obejrzyj wszystkie krawędzie.",
    highlight: "frames",
    cameraPos: [3.8, 0.6, 0],
  },
  {
    id: "cameras",
    title: "Wyspa aparatów",
    subtitle: "Stan szkiełek obiektywów, ramki wyspy.",
    highlight: "cameras",
    cameraPos: [-1.4, 1.3, -2.8],
    cameraLookAt: [-0.5, 0.8, 0],
  },
  {
    id: "cleaning",
    title: "Czyszczenie urządzenia",
    subtitle:
      "Kurz w głośnikach i porcie powoduje problemy. Jedna usługa — pokażemy gdzie czyścimy.",
    highlight: null,
    cameraPos: [0, 0, 4.0],
    cleaningTour: [
      {
        // Earpiece — front-top view, kamera blisko górnej części ekranu od
        // przodu (tam gdzie jest głośnik rozmów). NIE z góry żeby uniknąć
        // widoku samych ramek.
        pos: [0, 1.3, 3.0],
        lookAt: [0, 1.4, 0.5],
        highlight: "earpiece",
        caption: "Głośnik rozmów — pył przyczynia się do problemów ze słyszalnością",
        durationMs: 7200,
      },
      {
        pos: [0, -3.0, 1.4],
        lookAt: [0, -1.4, 0],
        highlight: "speakers",
        caption: "Głośniczki dolne — kurz tłumi dźwięk multimedia",
        durationMs: 7200,
      },
      {
        pos: [0, -3.5, 0.6],
        lookAt: [0, -1.6, 0],
        highlight: "port",
        caption: "Port ładowania — kurz blokuje połączenie z kablem",
        durationMs: 7200,
      },
    ],
  },
  {
    id: "damage",
    title: "Zaznacz uszkodzenia",
    subtitle:
      "Obróć telefon i kliknij w miejscu uszkodzenia. Marker pojawi się natychmiast.",
    highlight: null,
    // Zoom out żeby było widać cały telefon — łatwiej trafić w cel.
    cameraPos: [0, 0, 5.5],
  },
  {
    id: "summary",
    title: "Podsumowanie",
    subtitle: "Sprawdź zapisane oceny i dodaj uwagi końcowe.",
    highlight: null,
    cameraPos: [3.5, 1, 5.5],
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

/** Detekcja platformy + zwrot odpowiedniej instrukcji obracania modelem 3D. */
function getRotationInstruction(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  if (isMobile) {
    return "1 palec — obrót modelu, 2 palce — przybliżenie";
  }
  const isMac = /Mac|Macintosh/i.test(ua);
  if (isMac) {
    return "Trackpad: 1 palec — obrót, ścisk 2 palcami — przybliżenie";
  }
  return "Lewy przycisk myszy + ruch — obrót, scroll — przybliżenie";
}

/** Polskie etykiety nazw powierzchni dla markerów. */
const SURFACE_LABELS: Record<string, string> = {
  display: "Wyświetlacz",
  back: "Tylna szybka",
  cameras: "Wyspa aparatów",
  frames: "Ramki boczne",
  earpiece: "Głośnik rozmów",
  speakers: "Głośniczki dolne",
  port: "Port ładowania",
  frame: "Ramka",
};

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

  const onModelClick = (point: THREE.Vector3, surface: string) => {
    if (step.id !== "damage") return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  const isStepComplete = (s: Step): boolean => {
    switch (s.id) {
      case "display":
        return state.display_rating != null;
      case "back":
        return state.back_rating != null;
      case "frames":
        return state.frames_rating != null;
      case "cameras":
        return state.camera_rating != null;
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

  const StepIcon = STEP_ICONS[step.id];
  const update = (patch: Partial<VisualConditionState>) =>
    setState((s) => ({ ...s, ...patch }));

  // === Dynamic camera positioning na podstawie axes telefonu ===
  // axes: front/up/side wykryte z pozycji nazwanych nodów GLB. Liczymy pozycje
  // kamery POPRAWNIE niezależnie od orientacji modelu w pliku.
  const phoneAxesRef = useRef<PhoneAxes | null>(null);
  const [, forceUpdate] = useState(0);

  const handleAxesReady = (axes: PhoneAxes) => {
    phoneAxesRef.current = axes;
    forceUpdate((n) => n + 1);
  };

  const computeCameraForStep = (
    s: StepId,
    tourIdxValue: number,
  ): { pos: [number, number, number]; lookAt: [number, number, number] } => {
    const axes = phoneAxesRef.current;
    if (!axes) {
      // Fallback przed załadowaniem GLB.
      return { pos: [0, 0, 4], lookAt: [0, 0, 0] };
    }
    const D = axes.radius * 2.0; // distance scale
    const v3 = (x: THREE.Vector3): [number, number, number] => [x.x, x.y, x.z];
    const front = axes.front;
    const up = axes.up;
    const side = axes.side;

    const offsetFromCenter = (
      ...components: { dir: THREE.Vector3; mul: number }[]
    ): [number, number, number] => {
      const pos = new THREE.Vector3();
      for (const c of components) {
        pos.add(c.dir.clone().multiplyScalar(c.mul * D));
      }
      return v3(pos);
    };

    switch (s) {
      case "display":
        // Patrzymy z PRZODU prosto na ekran.
        return {
          pos: offsetFromCenter({ dir: front, mul: 1.1 }),
          lookAt: [0, 0, 0],
        };
      case "back":
        // Patrzymy od TYŁU prosto.
        return {
          pos: offsetFromCenter({ dir: front, mul: -1.1 }),
          lookAt: [0, 0, 0],
        };
      case "frames":
        // Inicjalna pozycja — orbit handle'owany w PhoneScene.
        return {
          pos: offsetFromCenter({ dir: side, mul: 1.0 }),
          lookAt: [0, 0, 0],
        };
      case "cameras":
        // Z TYŁU lekko od góry — patrzymy na wyspę aparatów (która jest na
        // tylnej powierzchni w górnej części).
        return {
          pos: offsetFromCenter(
            { dir: front, mul: -0.85 },
            { dir: up, mul: 0.4 },
          ),
          lookAt: v3(up.clone().multiplyScalar(D * 0.25)),
        };
      case "cleaning": {
        if (!step.cleaningTour) {
          return {
            pos: offsetFromCenter({ dir: front, mul: 1.0 }),
            lookAt: [0, 0, 0],
          };
        }
        const tour = step.cleaningTour[tourIdxValue];
        // Każdy spot w cleaning tour ma własną logikę kamery:
        if (tour.highlight === "earpiece") {
          // Front-top, blisko górnej krawędzi ekranu.
          return {
            pos: offsetFromCenter(
              { dir: front, mul: 1.0 },
              { dir: up, mul: 0.5 },
            ),
            lookAt: v3(up.clone().multiplyScalar(D * 0.4)),
          };
        }
        if (tour.highlight === "speakers") {
          // Front-bottom, lekko od dołu — głośniczki na dolnej krawędzi.
          return {
            pos: offsetFromCenter(
              { dir: front, mul: 0.8 },
              { dir: up, mul: -0.55 },
            ),
            lookAt: v3(up.clone().multiplyScalar(-D * 0.4)),
          };
        }
        if (tour.highlight === "port") {
          // Bardziej z dołu — port w środku dolnej krawędzi.
          return {
            pos: offsetFromCenter(
              { dir: front, mul: 0.45 },
              { dir: up, mul: -0.95 },
            ),
            lookAt: v3(up.clone().multiplyScalar(-D * 0.4)),
          };
        }
        return {
          pos: offsetFromCenter({ dir: front, mul: 1.0 }),
          lookAt: [0, 0, 0],
        };
      }
      case "damage":
        // Z PRZODU, oddalone żeby było widać cały telefon.
        return {
          pos: offsetFromCenter({ dir: front, mul: 1.5 }),
          lookAt: [0, 0, 0],
        };
      case "summary":
        // Z prawej strony lekko z góry — model przesunięty w lewo.
        return {
          pos: offsetFromCenter(
            { dir: front, mul: 1.3 },
            { dir: side, mul: 1.0 },
            { dir: up, mul: 0.3 },
          ),
          lookAt: [-1.8, 0, 0],
        };
      default:
        return {
          pos: offsetFromCenter({ dir: front, mul: 1.0 }),
          lookAt: [0, 0, 0],
        };
    }
  };

  const computed = computeCameraForStep(step.id, tourIdx);
  const currentCameraPos = computed.pos;
  const currentLookAt = computed.lookAt;
  const currentHighlight: HighlightId =
    step.id === "cleaning" && step.cleaningTour
      ? step.cleaningTour[tourIdx].highlight
      : step.highlight;
  const phonePosition: [number, number, number] =
    step.id === "summary" ? [-1.8, 0, 0] : [0, 0, 0];
  const playDisassembly = step.id === "summary";

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
              onPointerMissed={() => setEditingMarkerId(null)}
            >
              <PhoneScene
                highlight={currentHighlight}
                cameraPos={currentCameraPos}
                cameraLookAt={currentLookAt}
                brandColor={brandColorHex}
                isFramesStep={step.id === "frames"}
                framesAxis={phoneAxesRef.current?.up}
                screenOn={false}
                damageMarkers={state.damage_markers ?? []}
                damageMode={step.id === "damage"}
                playDisassembly={playDisassembly}
                phonePosition={phonePosition}
                onModelClick={onModelClick}
                onAxesReady={handleAxesReady}
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

            {/* Damage mode hint — instrukcje zależne od platformy. */}
            {step.id === "damage" && (
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

            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 text-[10px] uppercase tracking-wider text-white/80 font-mono">
              {brand || "Telefon"} · krok {stepIdx + 1} z {STEPS.length}
            </div>
          </div>

          {/* Step controls panel */}
          <div className="bg-white/5 backdrop-blur-md border-l border-white/10 p-4 overflow-y-auto">
            <StepInputs
              step={step}
              state={state}
              cleaningPrice={cleaningPrice}
              editingMarkerId={editingMarkerId}
              onChange={update}
              onUpdateMarkerDescription={updateMarkerDescription}
              onSelectMarker={setEditingMarkerId}
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
  editingMarkerId,
  onChange,
  onUpdateMarkerDescription,
  onSelectMarker,
  onRemoveMarker,
}: {
  step: Step;
  state: VisualConditionState;
  cleaningPrice: number | null;
  editingMarkerId: string | null;
  onChange: (patch: Partial<VisualConditionState>) => void;
  onUpdateMarkerDescription: (id: string, description: string) => void;
  onSelectMarker: (id: string | null) => void;
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
        cleaningPrice={cleaningPrice}
        onChange={onChange}
      />
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

// PendingMarkerEditor usunięte — markery dodają się natychmiast po kliknięciu
// w model, edycja opisu jest inline na liście markerów w panelu prawym.
function _UnusedPendingMarkerEditorPlaceholder() {
  return null;
}

/** Pełen panel podsumowania w prawej kolumnie summary step. Pokazuje
 * średnią, oceny per element, markery + treść notatek + cleaning total. */
function SummaryPanel({
  state,
  cleaningPrice,
  onChange,
}: {
  state: VisualConditionState;
  cleaningPrice: number | null;
  onChange: (patch: Partial<VisualConditionState>) => void;
}) {
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
      label: "Tylna szybka",
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

