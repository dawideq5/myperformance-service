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
  // Frames step state — angle integrowany per frame (zawsze rośnie, nigdy
  // nie cofa). lastT do obliczenia dt. velocity ramps up smooth od 0.
  const framesEntry = useRef<{
    angle: number;
    lastT: number;
    elapsed: number;
  } | null>(null);

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
    // Frames step: orbit kamery w płaszczyźnie YZ (X=0).
    //   1. angle0 = atan2(cur.y/Y_SCALE, cur.z) — start z aktualnej kamery.
    //   2. angularSpeed = MAX * (elapsed/RAMP)² — quadratic ramp, BARDZO
    //      łagodny start (przez pierwsze 0.5s ledwo się rusza).
    //   3. angle += speed * dt → monotonicznie rośnie, jeden kierunek.
    //   4. Camera lerp z warmup-pochodnym lambda → płynne follow bez
    //      teleportacji.
    const RADIUS = 6.0;
    const Y_SCALE = 0.55;
    const MAX_ANGULAR_SPEED = 0.32;
    const RAMP_SECONDS = 2.5;
    if (isFramesStep && !damageMode) {
      if (!framesEntry.current) {
        const cur = camera.position;
        const angle0 = Math.atan2(cur.y / Y_SCALE, cur.z);
        framesEntry.current = { angle: angle0, lastT: t, elapsed: 0 };
      }
      const e = framesEntry.current;
      const dtInner = Math.max(0, t - e.lastT);
      e.elapsed += dtInner;
      e.lastT = t;
      const w = Math.min(e.elapsed / RAMP_SECONDS, 1);
      const speedRamp = w * w; // quadratic ramp
      const angularSpeed = MAX_ANGULAR_SPEED * speedRamp;
      e.angle += angularSpeed * dtInner;
      const tgt = new THREE.Vector3(
        0,
        Math.sin(e.angle) * RADIUS * Y_SCALE,
        Math.cos(e.angle) * RADIUS,
      );
      // Lerp camera z lambdą też wymnożoną przez warmup — łagodny start
      // followingu, nie tylko orbitalnej speed.
      const followLambda = 2.5 * w;
      camera.position.lerp(tgt, 1 - Math.exp(-followLambda * dtInner));
      camera.lookAt(0, 0, 0);
    } else if (framesEntry.current) {
      framesEntry.current = null;
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
          lerpLambda={isCleaningStep ? 0.8 : 2.0}
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
