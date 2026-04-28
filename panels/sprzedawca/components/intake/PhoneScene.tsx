"use client";

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import {
  CameraRig,
  PhoneModel,
  type HighlightId,
} from "./PhoneModel";

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
  brandColor,
  isFramesStep,
  screenOn = false,
  damageMarkers = [],
  damageMode = false,
  onModelClick,
}: {
  highlight: HighlightId;
  cameraPos: [number, number, number];
  brandColor: string;
  isFramesStep: boolean;
  screenOn?: boolean;
  damageMarkers?: DamageMarker[];
  damageMode?: boolean;
  onModelClick?: (point: THREE.Vector3, surface: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const keyLightRef = useRef<THREE.DirectionalLight>(null);
  const fillLightRef = useRef<THREE.DirectionalLight>(null);

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      if (isFramesStep) {
        groupRef.current.rotation.y += dt * 0.45;
      } else {
        const cur = groupRef.current.rotation.y;
        const normalized = Math.atan2(Math.sin(cur), Math.cos(cur));
        groupRef.current.rotation.y =
          normalized + (-normalized) * Math.min(dt * 2.5, 1);
      }
    }
    // Subtelny ruch key light dla zmiennych cieni przy prezentacji.
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
      {/* W trybie damage user obraca telefon ręcznie — w innych krokach
          kamera animowana przez CameraRig (zablokowane manual). */}
      {damageMode ? (
        <OrbitControls
          enablePan={false}
          enableZoom
          enableRotate
          minDistance={3.5}
          maxDistance={7}
          rotateSpeed={0.7}
          zoomSpeed={0.7}
        />
      ) : (
        <CameraRig position={cameraPos} lookAt={[0, 0, 0]} />
      )}

      <ambientLight intensity={0.3} color="#aabbcc" />

      {/* Key light — animowany dla zmiennych cieni */}
      <directionalLight
        ref={keyLightRef}
        position={[5, 6, 4]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0005}
      />
      <directionalLight
        ref={fillLightRef}
        position={[-4, 2, 3]}
        intensity={0.55}
        color="#88aaff"
      />
      <directionalLight position={[0, -2, -5]} intensity={0.6} color="#ffaa66" />

      {/* Studio rim lights */}
      <pointLight position={[3, -3, 4]} intensity={0.5} color="#ffd9a0" />
      <pointLight position={[-3, 3, 4]} intensity={0.45} color="#a0d0ff" />

      <group ref={groupRef}>
        <PhoneModel
          highlight={highlight}
          brandColor={brandColor}
          screenOn={screenOn}
          damageMarkers={damageMarkers}
          onModelClick={damageMode ? onModelClick : undefined}
        />
      </group>

      <ContactShadows
        position={[0, -1.7, 0]}
        opacity={0.5}
        scale={6}
        blur={2.6}
        far={4}
        resolution={1024}
        color="#000000"
      />
    </>
  );
}
