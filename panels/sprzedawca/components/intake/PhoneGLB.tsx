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

/** Orientacja telefonu wyciągnięta z pozycji nazwanych nodów GLB. Używana
 * w PhoneScene/Configurator do liczenia kamer dynamicznie zamiast hardkodów. */
export interface PhoneAxes {
  /** Centrum telefonu w world space po skali grupy. */
  center: THREE.Vector3;
  /** Kierunek "do przodu" (od środka do display/cover). */
  front: THREE.Vector3;
  /** Kierunek "do góry" (od portu do front_cam/earpiece). */
  up: THREE.Vector3;
  /** Kierunek "w bok" — perpendicular do front i up. */
  side: THREE.Vector3;
  /** Promień bounding box (dla skali kamery). */
  radius: number;
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
  /** Wywoływany raz po załadowaniu modelu — pozwala parentowi pozycjonować
   *  kamerę dynamicznie na podstawie rzeczywistych pozycji elementów. */
  onAxesReady?: (axes: PhoneAxes) => void;
}

useGLTF.preload("/models/smartphone.glb", "/draco/");

export function PhoneGLB({
  highlight = null,
  damageMarkers = [],
  damageMode = false,
  playDisassembly = false,
  onModelClick,
  floating = true,
  onAxesReady,
}: PhoneGLBProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/models/smartphone.glb", "/draco/");
  const { actions, mixer } = useAnimations(animations, groupRef);

  // Klonowanie + auto-center + auto-skala + wykrywanie osi telefonu.
  const { clonedScene, normalize, axes } = useMemo(() => {
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
    cloned.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 3.5;
    const scaleFactor = maxDim > 0 ? targetSize / maxDim : 1;
    const localCenter = box.getCenter(new THREE.Vector3());
    const offsetCenter = localCenter.clone().multiplyScalar(scaleFactor);

    // === Wykryj orientację telefonu z pozycji nazwanych nodów ===
    // Po zastosowaniu group transform (scale=scaleFactor, position=-offsetCenter),
    // model będzie wycentrowany w (0,0,0). Liczymy KIERUNKI w lokalnej przestrzeni
    // GLB — nie zależą od scale ani translacji, więc są poprawne też po transform.
    const findNode = (
      ...candidates: string[]
    ): THREE.Object3D | null => {
      for (const name of candidates) {
        let found: THREE.Object3D | null = null;
        cloned.traverse((obj) => {
          if (found) return;
          if (obj.name && obj.name.toLowerCase().includes(name.toLowerCase())) {
            found = obj;
          }
        });
        if (found) return found;
      }
      return null;
    };

    const nodePos = (node: THREE.Object3D | null): THREE.Vector3 | null => {
      if (!node) return null;
      const p = new THREE.Vector3();
      node.getWorldPosition(p);
      return p;
    };

    const coverPos = nodePos(findNode("cover", "screen"));
    const backPos = nodePos(findNode("backplate"));
    const frontCamPos = nodePos(findNode("front_cam", "front_sensor", "inside_cam_holder"));
    const portPos = nodePos(findNode("charging_port"));

    // Domyślne osie (fallback gdy nie znajdziemy nodów).
    let frontDir = new THREE.Vector3(0, 0, 1);
    let upDir = new THREE.Vector3(0, 1, 0);

    if (coverPos && backPos) {
      // Front = od średniej (cover+back)/2 do cover.
      const mid = coverPos.clone().add(backPos).multiplyScalar(0.5);
      frontDir = coverPos.clone().sub(mid).normalize();
    } else if (coverPos) {
      frontDir = coverPos.clone().sub(localCenter).normalize();
    }

    if (frontCamPos && portPos) {
      // Up = od portu do front_cam (głośnik rozmów obok front_cam).
      upDir = frontCamPos.clone().sub(portPos).normalize();
    } else if (frontCamPos) {
      upDir = frontCamPos.clone().sub(localCenter).normalize();
    }

    // Side = perpendicular do up i front (cross product).
    const sideDir = new THREE.Vector3()
      .crossVectors(upDir, frontDir)
      .normalize();
    // Re-orthogonalize up żeby było idealnie prostopadłe do front i side.
    upDir = new THREE.Vector3().crossVectors(frontDir, sideDir).normalize();

    return {
      clonedScene: cloned,
      normalize: {
        offset: [-offsetCenter.x, -offsetCenter.y, -offsetCenter.z] as [
          number,
          number,
          number,
        ],
        scale: scaleFactor,
      },
      axes: {
        // Po transform group center jest w (0,0,0).
        center: new THREE.Vector3(0, 0, 0),
        front: frontDir,
        up: upDir,
        side: sideDir,
        radius: maxDim * scaleFactor * 0.5,
      } as PhoneAxes,
    };
  }, [scene]);

  // Notify parent o axes — used do dynamicznego pozycjonowania kamery.
  useEffect(() => {
    if (axes && onAxesReady) onAxesReady(axes);
  }, [axes, onAxesReady]);

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

  // Floating + mixer update. Bez highlight emissive — user prefers no glow.
  useFrame((_, dt) => {
    mixer?.update(dt);
    if (groupRef.current && floating && !damageMode && !playDisassembly) {
      const t = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
      const baseY = normalize.offset[1];
      groupRef.current.position.y = baseY + Math.sin(t * 0.8) * 0.04;
    }
  });
  // Reference to suppress unused-var warning — keep prop for backward compat.
  void highlight;
  void materialMap;

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
      {/* Markery — TYLKO gdy nie disassembly (ukrywamy podczas rozkładania). */}
      {!playDisassembly &&
        damageMarkers.map((m) => (
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
      {/* Markery 3× mniejsze: 0.018 → 0.006, ringi 0.026/0.032 → ~0.009/0.011 */}
      <pointLight
        ref={lightRef}
        color="#ff2828"
        distance={0.06}
        decay={1.6}
        intensity={0.35}
      />
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.006, 16, 16]} />
        <meshStandardMaterial
          color="#ff2020"
          emissive={new THREE.Color("#ff0000")}
          emissiveIntensity={1.6}
          roughness={0.3}
        />
      </mesh>
      <mesh ref={ring1Ref}>
        <ringGeometry args={[0.0085, 0.0107, 32]} />
        <meshBasicMaterial
          color="#ff3030"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring2Ref}>
        <ringGeometry args={[0.0085, 0.0107, 32]} />
        <meshBasicMaterial
          color="#ff5050"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.013, 16, 16]} />
        <meshBasicMaterial
          color="#ff3030"
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
