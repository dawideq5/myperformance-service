"use client";

import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Hiperrealistyczny model telefonu z GLB (iPhone 12 teardown).
 * Plik /models/smartphone.glb (~22 MB Draco). Zawiera animację 99-channel
 * z rozbiórką wszystkich części. Odtwarzamy ją w rewersie raz na mount —
 * części lecą do siebie i model się składa, potem zatrzymuje. */

export type HighlightId =
  | null
  | "display"
  | "back"
  | "cameras"
  | "frames"
  | "earpiece"
  | "speakers"
  | "port";

/** Mapowanie HighlightId → prefiksy nazw węzłów w GLB. Część może obejmować
 * wiele node'ów (np. wszystkie back_cam_*, back_cam_cover_* dla cameras). */
const HIGHLIGHT_NODE_PREFIXES: Record<Exclude<HighlightId, null>, string[]> = {
  display: ["cover", "screen"],
  back: ["backplate"],
  cameras: ["back_cam", "flashlight"],
  frames: ["body", "antenn"],
  earpiece: ["front_cam", "front_sensor", "inside_cam_holder"],
  speakers: ["mic"],
  port: ["charging_port", "cover_flex_cables"],
};

interface DamageMarker {
  id: string;
  x: number;
  y: number;
  z: number;
  description?: string;
}

interface PhoneGLBProps {
  highlight?: HighlightId;
  damageMarkers?: DamageMarker[];
  damageMode?: boolean;
  /** Click handler — przyjmuje 3D world point + nazwa surface (z prefiksu node). */
  onModelClick?: (point: THREE.Vector3, surface: string) => void;
}

// Draco decoder hostujemy lokalnie pod /draco/ — bez gstatic CDN (CSP-safe).
useGLTF.preload("/models/smartphone.glb", "/draco/");

export function PhoneGLB({
  highlight = null,
  damageMarkers = [],
  damageMode = false,
  onModelClick,
}: PhoneGLBProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(
    "/models/smartphone.glb",
    "/draco/",
  );
  const { actions, mixer } = useAnimations(animations, groupRef);

  // Klonujemy scene żeby refy materiałów były lokalne (uniknąć współdzielenia
  // emissive między instancjami).
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  // Mapa: HighlightId → lista MeshStandardMaterial (wszystkie meshe w danej
  // grupie). Buduje raz po załadowaniu.
  const materialMap = useMemo(() => {
    const map: Record<string, THREE.MeshStandardMaterial[]> = {};
    clonedScene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mesh = obj as THREE.Mesh;
      const name = mesh.name.toLowerCase();
      // Klonujemy materiały żeby zmiana emissive nie wpływała na innych userów
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) =>
          (m as THREE.Material).clone(),
        );
      } else if (mesh.material) {
        mesh.material = (mesh.material as THREE.Material).clone();
      }
      // Find which highlight bucket this belongs to.
      for (const [key, prefixes] of Object.entries(HIGHLIGHT_NODE_PREFIXES)) {
        if (prefixes.some((p) => name.includes(p))) {
          (map[key] ??= []).push(mesh.material as THREE.MeshStandardMaterial);
          break;
        }
      }
    });
    return map;
  }, [clonedScene]);

  // Odtwarzaj animację assembly raz na mount (timeScale -1 = od końca do
  // początku → części złożone w całość).
  useEffect(() => {
    if (!actions) return;
    const firstActionName = Object.keys(actions)[0];
    const action = firstActionName ? actions[firstActionName] : null;
    if (!action) return;
    const clip = action.getClip();
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = -1;
    action.time = clip.duration;
    action.play();
    // Mixer update potrzebny żeby pozostać na "0" frame po zakończeniu
    return () => {
      action.stop();
    };
  }, [actions]);

  // Pulsing emissive na materiałach aktywnego highlight.
  useFrame(({ clock }, dt) => {
    mixer?.update(dt);
    const t = clock.getElapsedTime();
    const pulse = (Math.sin(t * 2.2) + 1) / 2;
    const intensity = 0.3 + pulse * 0.7;
    const red = new THREE.Color(0xff3030);
    const black = new THREE.Color(0, 0, 0);

    for (const [key, mats] of Object.entries(materialMap)) {
      const isActive = key === highlight;
      for (const mat of mats) {
        if (!("emissive" in mat)) continue;
        if (isActive) {
          mat.emissive = red;
          if ("emissiveIntensity" in mat) {
            (mat as THREE.MeshStandardMaterial).emissiveIntensity = intensity * 0.55;
          }
        } else {
          mat.emissive = black;
          if ("emissiveIntensity" in mat) {
            (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0;
          }
        }
        mat.needsUpdate = true;
      }
    }
  });

  return (
    <group ref={groupRef} scale={6} position={[0, -0.3, 0]}>
      <primitive
        object={clonedScene}
        onClick={(e: { point: THREE.Vector3; delta: number; stopPropagation: () => void; object?: { name?: string } }) => {
          if (!damageMode || !onModelClick) return;
          // R3F event.delta = drag distance w pikselach (mouse-down → mouse-up).
          // > 5 oznacza że user obracał kamerą — to nie click.
          if (e.delta > 5) return;
          e.stopPropagation();
          const surface = inferSurface(e.object?.name ?? "");
          onModelClick(e.point, surface);
        }}
      />
      {damageMarkers.map((m) => (
        <DamagePin key={m.id} x={m.x} y={m.y} z={m.z} />
      ))}
    </group>
  );
}

function inferSurface(name: string): string {
  const n = name.toLowerCase();
  for (const [key, prefixes] of Object.entries(HIGHLIGHT_NODE_PREFIXES)) {
    if (prefixes.some((p) => n.includes(p))) return key;
  }
  return "frame";
}

function DamagePin({ x, y, z }: { x: number; y: number; z: number }) {
  const dotRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = (Math.sin(t * 2.4) + 1) / 2;
    if (dotRef.current) {
      dotRef.current.scale.setScalar(0.95 + pulse * 0.15);
    }
    if (ring1Ref.current) {
      const r1 = (t * 0.6) % 1;
      ring1Ref.current.scale.setScalar(1 + r1 * 1.6);
      const m = ring1Ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = (1 - r1) * 0.4;
    }
    if (ring2Ref.current) {
      const r2 = ((t * 0.6) + 0.5) % 1;
      ring2Ref.current.scale.setScalar(1 + r2 * 1.6);
      const m = ring2Ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = (1 - r2) * 0.4;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 0.5 + pulse * 0.6;
    }
  });

  return (
    <group position={[x, y, z]}>
      <pointLight
        ref={lightRef}
        color="#ff3030"
        distance={0.3}
        decay={1.8}
        intensity={0.5}
      />
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.012, 24, 24]} />
        <meshStandardMaterial
          color="#ff2020"
          emissive={new THREE.Color("#ff0000")}
          emissiveIntensity={1.4}
          roughness={0.3}
        />
      </mesh>
      <mesh ref={ring1Ref}>
        <ringGeometry args={[0.018, 0.022, 32]} />
        <meshBasicMaterial
          color="#ff3030"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={ring2Ref}>
        <ringGeometry args={[0.018, 0.022, 32]} />
        <meshBasicMaterial
          color="#ff5050"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.03, 24, 24]} />
        <meshBasicMaterial color="#ff3030" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}
