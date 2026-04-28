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

  if (
    tgtPos.current.x !== phonePosition[0] ||
    tgtPos.current.y !== phonePosition[1] ||
    tgtPos.current.z !== phonePosition[2]
  ) {
    tgtPos.current.set(...phonePosition);
  }

  useFrame(({ clock, camera }, dt) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.position.lerp(tgtPos.current, Math.min(dt * 1.4, 1));
      // Lerp rotacji Y telefonu do target. Szybszy lerp (4.0/s) żeby
      // animacja zakończyła się przed orbit kamery w frames step.
      if (!damageMode) {
        const cur = groupRef.current.rotation.y;
        let delta = phoneRotationY - cur;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        groupRef.current.rotation.y = cur + delta * Math.min(dt * 4.0, 1);
      }
    }
    // Frames step: kamera orbituje w PŁASZCZYŹNIE YZ (X=0). Płynna oscylacja
    // sin·smoothstep żeby krzywa bez gwałtownych skoków na końcach.
    // Lerp camera position do orbit target — bez snapów przy step transition.
    if (isFramesStep && !damageMode) {
      // Easeinout: arc ∈ [0..1] oscillating, smoothstep wygładza końce.
      const raw = (Math.sin(t * 0.22) + 1) / 2;
      const arc = raw * raw * (3 - 2 * raw); // smoothstep
      const angle = arc * Math.PI;
      const radius = 6.0;
      const tgt = new THREE.Vector3(
        0,
        Math.sin(angle) * radius * 0.65,
        Math.cos(angle) * radius,
      );
      camera.position.lerp(tgt, Math.min(dt * 3.5, 1));
      camera.lookAt(0, 0, 0);
    }
    // Animowane key + fill lights.
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
      ) : isFramesStep ? null /* frames step manual orbit, brak CameraRig */ : (
        <CameraRig position={cameraPos} lookAt={cameraLookAt ?? [0, 0, 0]} />
      )}

      {/* Symetryczne oświetlenie żeby panel tylny wyglądał tak samo jak
          przedni gdy phone obróci się 180° między display a back step. */}
      <ambientLight intensity={0.65} color="#aabbcc" />
      <hemisphereLight args={["#bbccff", "#332211", 0.45]} />
      <directionalLight
        ref={keyLightRef}
        position={[5, 6, 4]}
        intensity={1.4}
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
