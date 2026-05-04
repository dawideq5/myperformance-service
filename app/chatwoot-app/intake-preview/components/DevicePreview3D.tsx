"use client";

/**
 * DevicePreview3D — mała inline scena 3D dla Chatwoot Dashboard App iframe.
 *
 * W odróżnieniu od `PhoneConfigurator3D` (fullscreen modal w panelu sprzedawcy
 * używany do oznaczania uszkodzeń + ratingów), tu pokazujemy READ-ONLY
 * podgląd modelu z markerami uszkodzeń. Brak edycji, brak step navigation.
 *
 * Ładuje się dynamicznie (`next/dynamic`) — Canvas + drei używają WebGL
 * który nie działa SSR.
 */

import dynamic from "next/dynamic";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import type { HighlightId } from "./PhoneModel";

const Canvas = dynamic(
  () => import("@react-three/fiber").then((m) => m.Canvas),
  { ssr: false },
);
const PhoneScene = dynamic(() => import("./PhoneScene"), { ssr: false });

interface DamageMarker {
  id: string;
  x: number;
  y: number;
  z: number;
  description?: string;
  surface?: string;
  normal?: { x: number; y: number; z: number };
}

interface VisualConditionShape {
  damage_markers?: DamageMarker[];
  display?: number;
  back?: number;
  frames?: number;
  camera?: number;
  battery?: number;
  charging_works?: boolean;
  fingerprint_works?: boolean;
  faceid_works?: boolean;
  // ... inne ratings są tolerowane
  [k: string]: unknown;
}

export function DevicePreview3D({
  brandColorHex = "#6366f1",
  visualCondition,
}: {
  brandColorHex?: string | null;
  visualCondition: VisualConditionShape | null;
}) {
  const damageMarkers = useMemo(
    () =>
      Array.isArray(visualCondition?.damage_markers)
        ? visualCondition!.damage_markers!.filter((m) => m && typeof m === "object")
        : [],
    [visualCondition],
  );

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "4 / 3",
        background:
          "radial-gradient(ellipse at center, rgba(99,102,241,0.08) 0%, var(--bg-card) 70%)",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 6], fov: 35 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={1.2} />
          <directionalLight position={[-5, -5, -5]} intensity={0.4} />
          <PhoneScene
            highlight={"none" as HighlightId}
            cameraPos={[0, 0, 6]}
            cameraLookAt={[0, 0, 0]}
            isFramesStep={false}
            brandColor={brandColorHex ?? undefined}
            damageMarkers={damageMarkers.map((m) => ({
              id: m.id,
              x: m.x,
              y: m.y,
              z: m.z,
              description: m.description,
            }))}
            damageMode={false}
            playDisassembly={false}
            phonePosition={[0, 0, 0]}
            phoneRotationY={0}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Re-export THREE żeby nie dropować side-effect importu (PhoneScene linki).
export const _three = THREE;
