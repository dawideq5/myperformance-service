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
  damageMarkers = [],
  damageMode = false,
  playDisassembly = false,
  phonePosition = [0, 0, 0],
  onModelClick,
}: {
  highlight: HighlightId;
  cameraPos: [number, number, number];
  cameraLookAt?: [number, number, number];
  brandColor?: string;
  isFramesStep: boolean;
  screenOn?: boolean;
  damageMarkers?: DamageMarker[];
  damageMode?: boolean;
  playDisassembly?: boolean;
  /** Animowana pozycja całej grupy phone (np. -2 dla summary step). */
  phonePosition?: [number, number, number];
  onModelClick?: (point: THREE.Vector3, surface: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const keyLightRef = useRef<THREE.DirectionalLight>(null);
  const fillLightRef = useRef<THREE.DirectionalLight>(null);
  const tgtPos = useRef(new THREE.Vector3(...phonePosition));

  // Update target jeśli prop się zmienił.
  if (
    tgtPos.current.x !== phonePosition[0] ||
    tgtPos.current.y !== phonePosition[1] ||
    tgtPos.current.z !== phonePosition[2]
  ) {
    tgtPos.current.set(...phonePosition);
  }

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      // Lerp position do target (animacja przesunięcia phone w lewo dla summary).
      groupRef.current.position.lerp(tgtPos.current, Math.min(dt * 1.4, 1));
      if (!damageMode) {
        if (isFramesStep) {
          groupRef.current.rotation.y += dt * 0.4;
        } else if (!playDisassembly) {
          // Smooth back to neutral rotation gdy nie frames i nie damage.
          const cur = groupRef.current.rotation.y;
          const normalized = Math.atan2(Math.sin(cur), Math.cos(cur));
          groupRef.current.rotation.y =
            normalized + (-normalized) * Math.min(dt * 2.5, 1);
        }
      }
    }
    // Subtelne ruchy świateł — żywe cienie.
    if (keyLightRef.current) {
      keyLightRef.current.position.x = 5 + Math.sin(t * 0.15) * 0.6;
      keyLightRef.current.position.y = 6 + Math.cos(t * 0.12) * 0.5;
    }
    if (fillLightRef.current) {
      fillLightRef.current.position.x = -4 + Math.cos(t * 0.18) * 0.4;
    }
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
      ) : (
        <CameraRig position={cameraPos} lookAt={cameraLookAt ?? [0, 0, 0]} />
      )}

      <ambientLight intensity={0.45} color="#aabbcc" />
      <directionalLight
        ref={keyLightRef}
        position={[5, 6, 4]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0005}
      />
      <directionalLight
        ref={fillLightRef}
        position={[-4, 2, 3]}
        intensity={0.6}
        color="#88aaff"
      />
      <directionalLight position={[0, -2, -5]} intensity={0.55} color="#ffaa66" />
      <pointLight position={[3, -3, 4]} intensity={0.5} color="#ffd9a0" />
      <pointLight position={[-3, 3, 4]} intensity={0.45} color="#a0d0ff" />

      <group ref={groupRef}>
        <Suspense fallback={null}>
          <PhoneGLB
            highlight={highlight}
            damageMarkers={damageMarkers}
            damageMode={damageMode}
            playDisassembly={playDisassembly}
            onModelClick={onModelClick}
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
