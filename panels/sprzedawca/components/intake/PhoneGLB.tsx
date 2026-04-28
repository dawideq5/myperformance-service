"use client";

import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** GLB phone model — auto-centered i auto-skalowany, bez intro animation
 * (telefon startuje jako złożony). Disassembly animation triggered ręcznie
 * przez prop playDisassembly. Markery to dzieci grupy phone — poruszają się
 * razem z telefonem przy obrotach kamery i w trybie damage. */

export type HighlightId =
  | null
  | "display"
  | "back"
  | "cameras"
  | "frames"
  | "earpiece"
  | "speakers"
  | "port";

const HIGHLIGHT_NODE_PREFIXES: Record<Exclude<HighlightId, null>, string[]> = {
  display: ["cover", "screen"],
  back: ["backplate"],
  cameras: ["back_cam", "flashlight"],
  frames: ["body", "antenn", "btn_off", "btn_volume"],
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
  /** Trigger disassembly animation (summary step). */
  playDisassembly?: boolean;
  /** Callback dla kliku w model — pozycja w LOKALNYCH koordynatach grupy. */
  onModelClick?: (localPoint: THREE.Vector3, surface: string) => void;
  /** Subtelne unoszenie się modelu w przestrzeni (idle effect). */
  floating?: boolean;
}

useGLTF.preload("/models/smartphone.glb", "/draco/");

export function PhoneGLB({
  highlight = null,
  damageMarkers = [],
  damageMode = false,
  playDisassembly = false,
  onModelClick,
  floating = true,
}: PhoneGLBProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/models/smartphone.glb", "/draco/");
  const { actions, mixer } = useAnimations(animations, groupRef);

  // Klonowanie + auto-center + auto-skala. Robimy raz i pamiętamy.
  const { clonedScene, normalize } = useMemo(() => {
    const cloned = scene.clone(true);
    // Klonuj materiały żeby emissive nie collide między instancjami.
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map((m) => m.clone());
        } else if (obj.material) {
          obj.material = obj.material.clone();
        }
      }
    });
    // Compute bounding box → auto-center + scale to fit ~3.5 unit max dim.
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 3.5;
    const scaleFactor = maxDim > 0 ? targetSize / maxDim : 1;
    const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scaleFactor);
    return {
      clonedScene: cloned,
      normalize: {
        offset: [-center.x, -center.y, -center.z] as [number, number, number],
        scale: scaleFactor,
      },
    };
  }, [scene]);

  // Mapowanie HighlightId → materiały meshy. Klonowane materiały to nasze, możemy
  // mutować emissive bez side effects.
  const materialMap = useMemo(() => {
    const map: Record<string, THREE.MeshStandardMaterial[]> = {};
    clonedScene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const name = obj.name.toLowerCase();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const [key, prefixes] of Object.entries(HIGHLIGHT_NODE_PREFIXES)) {
        if (prefixes.some((p) => name.includes(p))) {
          for (const m of mats) {
            if (m && "emissive" in m) {
              (map[key] ??= []).push(m as THREE.MeshStandardMaterial);
            }
          }
          break;
        }
      }
    });
    return map;
  }, [clonedScene]);

  // Initial state: złożony, animacja zatrzymana w klatce 0.
  useEffect(() => {
    if (!actions || !mixer) return;
    const firstActionName = Object.keys(actions)[0];
    const action = firstActionName ? actions[firstActionName] : null;
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = 1;
    action.time = 0;
    action.play();
    action.paused = true;
    mixer.update(0);
  }, [actions, mixer]);

  // Trigger disassembly animation gdy playDisassembly = true.
  useEffect(() => {
    if (!actions || !mixer) return;
    const firstActionName = Object.keys(actions)[0];
    const action = firstActionName ? actions[firstActionName] : null;
    if (!action) return;
    if (playDisassembly) {
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 0.4; // wolniej dla wow effectu
      action.time = 0;
      action.paused = false;
      action.play();
    } else {
      action.time = 0;
      action.timeScale = 1;
      action.paused = true;
      mixer.update(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playDisassembly]);

  // Pulsing emissive na wybranych meshach + idle floating.
  useFrame(({ clock }, dt) => {
    mixer?.update(dt);
    const t = clock.getElapsedTime();
    const pulse = (Math.sin(t * 2.2) + 1) / 2;
    const intensity = 0.25 + pulse * 0.55;
    const red = new THREE.Color(0xff3030);
    const black = new THREE.Color(0, 0, 0);

    for (const [key, mats] of Object.entries(materialMap)) {
      const isActive = key === highlight;
      for (const mat of mats) {
        if (!("emissive" in mat)) continue;
        if (isActive) {
          mat.emissive = red;
          if ("emissiveIntensity" in mat) {
            (mat as THREE.MeshStandardMaterial).emissiveIntensity = intensity * 0.6;
          }
        } else {
          mat.emissive = black;
          if ("emissiveIntensity" in mat) {
            (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0;
          }
        }
      }
    }

    // Subtelny floating effect (oddychanie). Wyłączony w damage mode (user obraca).
    if (groupRef.current && floating && !damageMode && !playDisassembly) {
      const baseY = normalize.offset[1];
      groupRef.current.position.y = baseY + Math.sin(t * 0.8) * 0.04;
    }
  });

  return (
    <group
      ref={groupRef}
      position={normalize.offset}
      scale={normalize.scale}
    >
      <primitive
        object={clonedScene}
        onClick={(e: {
          point: THREE.Vector3;
          delta: number;
          stopPropagation: () => void;
          object?: { name?: string };
        }) => {
          if (!damageMode || !onModelClick) return;
          if (e.delta > 5) return;
          e.stopPropagation();
          // Convert world point → local space (znormalizowane przez group transform).
          if (!groupRef.current) return;
          const local = groupRef.current.worldToLocal(e.point.clone());
          onModelClick(local, inferSurface(e.object?.name ?? ""));
        }}
      />
      {/* Markery to dzieci grupy phone — pozycje w LOKALNYCH koordynatach. */}
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
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    const pulse = (Math.sin(t * 2.4) + 1) / 2;
    if (dotRef.current) dotRef.current.scale.setScalar(0.95 + pulse * 0.15);
    if (ring1Ref.current) {
      const r1 = (t * 0.6) % 1;
      ring1Ref.current.scale.setScalar(1 + r1 * 1.6);
      const m = ring1Ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = (1 - r1) * 0.45;
    }
    if (ring2Ref.current) {
      const r2 = ((t * 0.6) + 0.5) % 1;
      ring2Ref.current.scale.setScalar(1 + r2 * 1.6);
      const m = ring2Ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = (1 - r2) * 0.45;
    }
    if (lightRef.current) lightRef.current.intensity = 0.4 + pulse * 0.5;
    // Pierścienie skierowane do kamery (billboard) żeby zawsze były widoczne.
    if (groupRef.current) {
      groupRef.current.lookAt(camera.position);
    }
  });

  return (
    <group ref={groupRef} position={[x, y, z]}>
      <pointLight
        ref={lightRef}
        color="#ff2828"
        distance={0.18}
        decay={1.6}
        intensity={0.4}
      />
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.018, 24, 24]} />
        <meshStandardMaterial
          color="#ff2020"
          emissive={new THREE.Color("#ff0000")}
          emissiveIntensity={1.6}
          roughness={0.3}
        />
      </mesh>
      <mesh ref={ring1Ref}>
        <ringGeometry args={[0.026, 0.032, 32]} />
        <meshBasicMaterial
          color="#ff3030"
          transparent
          opacity={0.45}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring2Ref}>
        <ringGeometry args={[0.026, 0.032, 32]} />
        <meshBasicMaterial
          color="#ff5050"
          transparent
          opacity={0.45}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.04, 24, 24]} />
        <meshBasicMaterial
          color="#ff3030"
          transparent
          opacity={0.14}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
