"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CameraRig, PhoneModel, type HighlightId } from "./PhoneModel";

export default function PhoneScene({
  highlight,
  cameraPos,
  brandColor,
  isFramesStep,
}: {
  highlight: HighlightId;
  cameraPos: [number, number, number];
  brandColor: string;
  isFramesStep: boolean;
}) {
  // Auto-rotacja kąta tylko podczas kroku "frames" — wtedy obracamy telefonem
  // wzdłuż osi Y, żeby pokazać wszystkie boki.
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    if (isFramesStep) {
      groupRef.current.rotation.y += dt * 0.6;
    } else {
      // Smoothly back to 0
      const target = 0;
      const cur = groupRef.current.rotation.y;
      groupRef.current.rotation.y = cur + (target - cur) * Math.min(dt * 2, 1);
    }
  });

  // Reset rotation when leaving frames step.
  useEffect(() => {
    if (!isFramesStep && groupRef.current) {
      // Snap towards 0 only after step change; gentle animation handled in useFrame.
    }
  }, [isFramesStep]);

  return (
    <>
      <CameraRig position={cameraPos} lookAt={[0, 0, 0]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[5, 5, 5]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-3, -2, -3]} intensity={0.3} />
      <pointLight position={[0, 0, 4]} intensity={0.4} color="#88aaff" />

      <group ref={groupRef}>
        <PhoneModel highlight={highlight} brandColor={brandColor} />
      </group>

      {/* Bez Environment HDRI (zewnętrzny CDN drei) — zastąpione lokalnymi rim
          lights żeby uniknąć CSP issues. */}
      <pointLight position={[3, -3, 2]} intensity={0.5} color="#ffaa66" />
      <pointLight position={[-3, 3, -2]} intensity={0.4} color="#66aaff" />
      {/* Wyłączone — zostawiamy tylko płynne przejścia kamery; user nie kręci */}
      <OrbitControls
        enabled={false}
        enablePan={false}
        enableZoom={false}
        enableRotate={false}
      />
    </>
  );
}
