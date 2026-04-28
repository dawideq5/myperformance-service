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
  const keyLightRef = useRef<THREE.DirectionalLight>(null);
  const fillLightRef = useRef<THREE.DirectionalLight>(null);
  const tgtPos = useRef(new THREE.Vector3(...phonePosition));
  // Frames step entry state — żeby orbit zaczynał się płynnie z bieżącej
  // pozycji kamery, bez "snap" do angle=0.
  const framesEntry = useRef<{ angle0: number; t0: number } | null>(null);

  if (
    tgtPos.current.x !== phonePosition[0] ||
    tgtPos.current.y !== phonePosition[1] ||
    tgtPos.current.z !== phonePosition[2]
  ) {
    tgtPos.current.set(...phonePosition);
  }

  useFrame(({ clock, camera }, dt) => {
    const t = clock.getElapsedTime();
    // Damp utility: frame-rate independent smoothing. lambda = ile sekund do
    // ~63% drogi. Wyższy = szybszy. Wzór: 1 - exp(-lambda * dt). Lepszy niż
    // raw `Math.min(dt * x, 1)` bo nie miga przy nierównej framerate.
    const damp = (lambda: number) => 1 - Math.exp(-lambda * dt);

    if (groupRef.current) {
      // Wolniejsza lambda = bardziej cinematic, mniej "gwałtownego" startu.
      groupRef.current.position.lerp(tgtPos.current, damp(2.0));
      if (!damageMode) {
        const cur = groupRef.current.rotation.y;
        let delta = phoneRotationY - cur;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        groupRef.current.rotation.y = cur + delta * damp(2.8);
      }
    }
    // Frames step: ciągły orbit kamery w płaszczyźnie YZ (X=0). angle0
    // wyliczany z bieżącej pozycji kamery przy wejściu w step → orbit
    // zaczyna się SEAMLESSLY od miejsca gdzie kamera już jest, bez snap
    // i bez catch-up. Brak lerp — pozycja ustawiana bezpośrednio (skoro
    // start = current pos, kolejne klatki są arbitralnie blisko).
    const RADIUS = 6.0;
    const Y_SCALE = 0.55;
    if (isFramesStep && !damageMode) {
      if (!framesEntry.current) {
        const cur = camera.position;
        // Inverse: y = sin(a)*R*S, z = cos(a)*R → a = atan2(y/S, z)
        const angle0 = Math.atan2(cur.y / Y_SCALE, cur.z);
        framesEntry.current = { angle0, t0: t };
      }
      const e = framesEntry.current;
      const angle = e.angle0 + (t - e.t0) * 0.32;
      camera.position.set(
        0,
        Math.sin(angle) * RADIUS * Y_SCALE,
        Math.cos(angle) * RADIUS,
      );
      camera.lookAt(0, 0, 0);
    } else if (framesEntry.current) {
      framesEntry.current = null;
    }
    // Animowane key + fill lights — bardzo subtelnie żeby nie powodowały
    // wrażenia "flickeru". Mniejsza amplituda + niższa częstotliwość.
    if (keyLightRef.current) {
      keyLightRef.current.position.x = 5 + Math.sin(t * 0.1) * 0.3;
      keyLightRef.current.position.y = 6 + Math.cos(t * 0.08) * 0.25;
    }
    if (fillLightRef.current) {
      fillLightRef.current.position.x = -4 + Math.cos(t * 0.12) * 0.2;
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
      ) : isFramesStep ? null /* frames step manual orbit, brak CameraRig */ : (
        <CameraRig
          position={cameraPos}
          lookAt={cameraLookAt ?? [0, 0, 0]}
          duration={isCleaningStep ? 4.0 : 1.6}
        />
      )}

      {/* Symetryczne oświetlenie żeby panel tylny wyglądał tak samo jak
          przedni gdy phone obróci się 180° między display a back step. */}
      <ambientLight intensity={0.65} color="#aabbcc" />
      <hemisphereLight args={["#bbccff", "#332211", 0.45]} />
      <directionalLight
        ref={keyLightRef}
        position={[5, 6, 4]}
        intensity={1.4}
      />
      {/* Mirror key light z drugiej strony żeby tylna strona phone'a też była
          oświetlona po obrocie 180°. */}
      <directionalLight
        position={[-5, 6, -4]}
        intensity={1.2}
        color="#ffeecc"
      />
      <directionalLight
        ref={fillLightRef}
        position={[-4, 2, 3]}
        intensity={0.55}
        color="#88aaff"
      />
      <directionalLight position={[4, 2, -3]} intensity={0.5} color="#88aaff" />
      <pointLight position={[3, -3, 4]} intensity={0.45} color="#ffd9a0" />
      <pointLight position={[-3, 3, 4]} intensity={0.4} color="#a0d0ff" />

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
