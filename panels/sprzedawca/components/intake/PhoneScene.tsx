"use client";

import { ContactShadows } from "@react-three/drei";
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

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    if (isFramesStep) {
      groupRef.current.rotation.y += dt * 0.5;
    } else {
      const target = 0;
      const cur = groupRef.current.rotation.y;
      // Normalize cur to [-PI, PI]
      const normalized = Math.atan2(Math.sin(cur), Math.cos(cur));
      groupRef.current.rotation.y =
        normalized + (target - normalized) * Math.min(dt * 2.5, 1);
    }
  });

  return (
    <>
      <CameraRig position={cameraPos} lookAt={[0, 0, 0]} />

      {/* Tonemapping-style lighting setup (3-point + rim + fill) */}
      <ambientLight intensity={0.35} color="#aabbcc" />
      {/* Key light — biały, mocny */}
      <directionalLight
        position={[5, 6, 4]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      {/* Fill light — chłodny, słabszy z drugiej strony */}
      <directionalLight position={[-4, 2, 3]} intensity={0.6} color="#88aaff" />
      {/* Rim light — z tyłu, ciepły, dla highlight krawędzi */}
      <directionalLight position={[0, -2, -5]} intensity={0.7} color="#ffaa66" />
      {/* Studio fill — punktowe światła nadające reflective bliki */}
      <pointLight position={[3, -3, 4]} intensity={0.6} color="#ffd9a0" />
      <pointLight position={[-3, 3, 4]} intensity={0.5} color="#a0d0ff" />
      {/* Bottom uplight — lekki kontur podstawy */}
      <pointLight position={[0, -4, 1]} intensity={0.3} color="#ffffff" />

      <group ref={groupRef}>
        <PhoneModel
          highlight={highlight}
          brandColor={brandColor}
          screenOn={screenOn}
          damageMarkers={damageMarkers}
          onModelClick={damageMode ? onModelClick : undefined}
        />
      </group>

      {/* Mięka kontaktowa cień — daje grunt i osadza model w przestrzeni */}
      <ContactShadows
        position={[0, -1.7, 0]}
        opacity={0.55}
        scale={6}
        blur={2.4}
        far={4}
        resolution={1024}
        color="#000000"
      />
    </>
  );
}
