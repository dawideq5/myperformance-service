"use client";

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import * as THREE from "three";
import { CameraRig } from "./PhoneModel";
import { PhoneGLB, type HighlightId } from "./PhoneGLB";

interface DamageMarker {
  id: string;
  x: number;
  y: number;
  z: number;
  description?: string;
}

export default function PhoneScene({
  highlight,
  cameraPos,
  cameraLookAt,
  isFramesStep,
  isCleaningStep = false,
  brandColor,
  damageMarkers = [],
  damageMode = false,
  playDisassembly = false,
  phonePosition = [0, 0, 0],
  phoneRotationY = 0,
  onModelClick,
}: {
  highlight: HighlightId;
  cameraPos: [number, number, number];
  cameraLookAt?: [number, number, number];
  brandColor?: string;
  isFramesStep: boolean;
  /** Cleaning tour — wolniejszy lerp kamery dla cinematic feel. */
  isCleaningStep?: boolean;
  screenOn?: boolean;
  damageMarkers?: DamageMarker[];
  damageMode?: boolean;
  playDisassembly?: boolean;
  phonePosition?: [number, number, number];
  /** Animowana rotacja telefonu wokół osi Y (np. flip display→back). */
  phoneRotationY?: number;
  onModelClick?: (point: THREE.Vector3, candidates: string[]) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const tgtPos = useRef(new THREE.Vector3(...phonePosition));

  if (
    tgtPos.current.x !== phonePosition[0] ||
    tgtPos.current.y !== phonePosition[1] ||
    tgtPos.current.z !== phonePosition[2]
  ) {
    tgtPos.current.set(...phonePosition);
  }

  useFrame((_, dt) => {
    const damp = (lambda: number) => 1 - Math.exp(-lambda * dt);
    if (groupRef.current) {
      groupRef.current.position.lerp(tgtPos.current, damp(2.0));
      if (!damageMode) {
        const cur = groupRef.current.rotation.y;
        let delta = phoneRotationY - cur;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        groupRef.current.rotation.y = cur + delta * damp(2.8);
      }
    }
    // Frames step orbit obsługiwany przez <OrbitControls autoRotate /> niżej —
    // brak custom angle math, brak gimbal locka, brak "przeskoku przez biegun".
  });

  return (
    <>
      {damageMode ? (
        <OrbitControls
          enablePan={false}
          enableZoom
          enableRotate
          minDistance={3.5}
          maxDistance={9}
          rotateSpeed={0.7}
          zoomSpeed={0.7}
        />
      ) : isFramesStep ? (
        // Smooth auto-rotate orbit obsługiwany natywnie przez OrbitControls.
        // minPolarAngle/maxPolarAngle odsuwa kamerę od bieguna → brak gimbal
        // locka i "przeskoku" osi w połowie obrotu. Constant Y range = stała
        // wysokość obrotu, jednorodny ruch w jednym kierunku.
        <OrbitControls
          autoRotate
          autoRotateSpeed={1.5}
          enablePan={false}
          enableZoom={false}
          enableRotate={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={(2 * Math.PI) / 3}
          target={[0, 0, 0]}
        />
      ) : (
        <CameraRig
          position={cameraPos}
          lookAt={cameraLookAt ?? [0, 0, 0]}
          lerpLambda={isCleaningStep ? 0.7 : 1.5}
        />
      )}

      {/* Domyślny zestaw świateł — neutralny, statyczny, bez animacji.
          Symetria po obu stronach żeby model wyglądał tak samo z przodu
          i z tyłu. */}
      <ambientLight intensity={0.65} />
      <directionalLight position={[5, 6, 4]} intensity={1.0} />
      <directionalLight
        position={[-5, 6, -4]}
        intensity={0.9}
      />

      <group ref={groupRef}>
        <Suspense fallback={null}>
          <PhoneGLB
            highlight={highlight}
            damageMarkers={damageMarkers}
            damageMode={damageMode}
            playDisassembly={playDisassembly}
            onModelClick={onModelClick}
            brandColor={brandColor}
          />
        </Suspense>
      </group>

      <ContactShadows
        position={[0, -1.95, 0]}
        opacity={0.65}
        scale={8}
        blur={2.5}
        far={4}
        resolution={1024}
        color="#000000"
      />
    </>
  );
}
