"use client";

import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
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
  /** Callback dla kliku w model — pozycja w LOKALNYCH koordynatach grupy +
   * lista kandydatów stref (1 = jedyna opcja, >1 = boundary, popup z wyborem). */
  onModelClick?: (localPoint: THREE.Vector3, candidates: string[]) => void;
  /** Subtelne unoszenie się modelu w przestrzeni (idle effect). */
  floating?: boolean;
  /** Kolor body urządzenia — z ColorPicker w intake formie (hex). */
  brandColor?: string;
}

useGLTF.preload("/models/smartphone.glb", "/draco/");

export function PhoneGLB({
  highlight = null,
  damageMarkers = [],
  damageMode = false,
  playDisassembly = false,
  onModelClick,
  floating = true,
  brandColor,
}: PhoneGLBProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/models/smartphone.glb", "/draco/");
  const { actions, mixer } = useAnimations(animations, groupRef);

  const { gl } = useThree();

  // Klonowanie sceny BEZ klonowania materiałów. Materiały referencyjnie
  // współdzielone z originalną sceną — bez mutacji w useMemo (mutacje są
  // w osobnym useEffect z dostępem do renderera, gdzie ustawiamy sRGB +
  // anisotropy + frustumCulled przy każdym mount).
  const { clonedScene, normalize } = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        // Shadows wyłączone — hipoteza: shadow map sampling na niektórych
        // GPU/browser combos (Windows Edge/Chrome) powodował efekt "missing
        // textures" (model czarny/biały). ContactShadows + ambient/key
        // light same w sobie zapewniają wystarczający volume look.
        obj.castShadow = false;
        obj.receiveShadow = false;
        // Frustum culling off — chroni przed dziwnym znikaniem meshy gdy
        // bounding sphere/box sceny jest źle policzony po klonie.
        obj.frustumCulled = false;
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

  // Po mount: dla wszystkich tekstur w scenie wymuszamy sRGB color space +
  // maxAnisotropy z renderera + needsUpdate. Robimy to po mount renderera
  // (gl gotowy), nie w useMemo — niektóre browsery (Windows Edge/Chrome)
  // nie zaczytywały tekstur poprawnie gdy sRGB ustawiane było zbyt wcześnie.
  useEffect(() => {
    if (!clonedScene || !gl) return;
    const maxAniso = gl.capabilities.getMaxAnisotropy?.() ?? 1;
    clonedScene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        const sm = m as THREE.MeshStandardMaterial;
        // baseColorMap / emissiveMap — sRGB.
        if (sm.map) {
          sm.map.colorSpace = THREE.SRGBColorSpace;
          sm.map.anisotropy = maxAniso;
          sm.map.needsUpdate = true;
        }
        if (sm.emissiveMap) {
          sm.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          sm.emissiveMap.needsUpdate = true;
        }
        // Linear maps (normal/roughness/metalness/ao) — bez sRGB, ale
        // anisotropy + needsUpdate na każdej mapie.
        for (const k of ["normalMap", "roughnessMap", "metalnessMap", "aoMap"] as const) {
          const tex = sm[k];
          if (tex) {
            tex.anisotropy = maxAniso;
            tex.needsUpdate = true;
          }
        }
        sm.needsUpdate = true;
      }
    });
  }, [clonedScene, gl]);

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

  // Body color override. W naszym GLB descriptive names są na grupach-rodzicach
  // (body_36, backplate_48, back_cover_*, profile_housing_*); meshe mają
  // nazwy Object_X. Matchujemy przez ancestryName (konkatenacja parents +
  // material name).
  //
  // Trzy kategorie kolorów:
  //  - fixedBackIncludes (titanium white) — back_cover/backplate
  //  - darkFrameIncludes (ciemnoszare) — profile_housing (ramki) ZAWSZE
  //  - brandIncludes (brandColor) — back_cam_cover, anteny, przyciski
  //  - inne meshe (excludes lub bez matcha) zachowują oryginalne textury
  useEffect(() => {
    if (!clonedScene) return;
    const bodyColor = new THREE.Color(brandColor || "#1f2937");
    const TITANIUM_WHITE = new THREE.Color("#e8e7df");
    const DARK_GRAY = new THREE.Color("#3a3a3a");
    const fixedBackIncludes = ["backplate", "back_cover"];
    const darkFrameIncludes = ["profile_housing"]; // ramki bottom/top/left/right
    const brandIncludes = [
      "back_cam_cover",
      "antenn",
      "btn_off",
      "btn_volume",
    ];
    const excludes = [
      "inside",
      "dummies",
      "glue",
      "grid",
      "battery",
      "screen",
      "cover_flex",
      "back_cam_mat",
      "glass",
      "hole",
      "screw",
      "magnets",
      "motherboard",
      "wires",
    ];
    /** Konkatenuje nazwy wszystkich rodziców + materiału — używane do
     * dopasowania body części niezależnie od tego gdzie nazwa jest
     * w hierarchii GLB. */
    const ancestryName = (obj: THREE.Object3D, mat?: THREE.Material): string => {
      const names: string[] = [];
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (cur.name) names.push(cur.name.toLowerCase());
        cur = cur.parent;
      }
      if (mat?.name) names.push(mat.name.toLowerCase());
      return names.join("|");
    };
    /** Zwraca docelowy kolor + material params dla mesha. null = pomijamy. */
    const targetColor = (
      n: string,
    ): { color: THREE.Color; metalness: number; roughness: number } | null => {
      if (excludes.some((p) => n.includes(p))) return null;
      if (fixedBackIncludes.some((p) => n.includes(p))) {
        return { color: TITANIUM_WHITE, metalness: 0.25, roughness: 0.5 };
      }
      if (darkFrameIncludes.some((p) => n.includes(p))) {
        return { color: DARK_GRAY, metalness: 0.6, roughness: 0.4 };
      }
      if (brandIncludes.some((p) => n.includes(p))) {
        return { color: bodyColor, metalness: 0.55, roughness: 0.35 };
      }
      return null;
    };

    clonedScene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const newMats = mats.map((m) => {
        if (!m) return m;
        const n = ancestryName(obj, m);
        const tgt = targetColor(n);
        if (!tgt) return m;
        const sm = m as THREE.MeshStandardMaterial;
        const newMat = sm.clone();
        newMat.color = tgt.color.clone();
        newMat.map = null;
        newMat.metalness = tgt.metalness;
        newMat.roughness = tgt.roughness;
        newMat.needsUpdate = true;
        return newMat;
      });
      obj.material = Array.isArray(obj.material)
        ? (newMats as THREE.Material[])
        : (newMats[0] as THREE.Material);
    });
  }, [clonedScene, brandColor]);

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

  // Floating + mixer update. Bardzo subtelne unoszenie (0.018 zamiast 0.04)
  // żeby nie konkurowało z lerpem pozycji telefonu z PhoneScene podczas
  // step transition (wcześniej dawało wrażenie "drgającego" telefonu).
  useFrame((_, dt) => {
    mixer?.update(dt);
    if (groupRef.current && floating && !damageMode && !playDisassembly) {
      const t = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
      const baseY = normalize.offset[1];
      groupRef.current.position.y = baseY + Math.sin(t * 0.6) * 0.018;
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
          if (!groupRef.current) return;
          // Klasyfikacja w WORLD coords — phone jest auto-skalowany do
          // maxDim 3.5 i wycentrowany w (0,0,0), więc world coords są
          // bezpośrednio relatywne do telefonu (X±0.09 thin, Y±1.7 long,
          // Z±0.85 wide). Local coords by były w GLB internal scale (duże
          // liczby) — użycie world dla klasyfikacji jest poprawne.
          const worldP = e.point.clone();
          const local = groupRef.current.worldToLocal(e.point.clone());
          onModelClick(local, classifyDamageZones(worldP));
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

/** Klasyfikuje punkt kliknięcia (WORLD space) — może zwrócić wiele kandydatów
 * gdy klik jest blisko granicy między strefami (np. ramka/wyświetlacz).
 * Pierwszy element listy = najbardziej prawdopodobna strefa. Jeśli więcej
 * niż 1 kandydat — UI pokazuje popup z wyborem.
 *
 * Telefon auto-skalowany do max dim ~3.5 i wycentrowany w (0,0,0):
 *   X (depth): ±0.09  | Y (height): ±1.6  | Z (width): ±0.8
 *   +X=display, -X=panel tylny, +Y=góra, -Y=dół, ±Z=ramki boczne
 */
function classifyDamageZones(point: THREE.Vector3): string[] {
  const { x, y, z } = point;
  const candidates: string[] = [];

  // Tolerancja granicy (boundary margin) — w jednostkach world.
  const M = 0.18;

  // Specyficzne strefy najpierw.
  if (y < -1.4) {
    candidates.push("Port ładowania / głośniki dolne");
  }
  if (x < 0 && y > 0.55 && z < 0.25) {
    candidates.push("Wyspa aparatów");
  }
  if (y > 1.35 && x > 0) {
    candidates.push("Głośnik rozmów");
  }

  // Krawędzie ramek (long axis top/bottom).
  if (y > 1.25) {
    candidates.push("Górna krawędź (ramka)");
  } else if (y < -1.25) {
    if (!candidates.includes("Port ładowania / głośniki dolne")) {
      candidates.push("Dolna krawędź (ramka)");
    }
  }
  // Boczne ramki.
  if (z > 0.55) candidates.push("Ramka prawa");
  else if (z < -0.55) candidates.push("Ramka lewa");

  // Powierzchnia front/back — dodawana zawsze, jeśli klik nie skrajny
  // (czyli zostaje jako alternatywa dla edge zone w boundary cases).
  if (Math.abs(y) < 1.25 + M && Math.abs(z) < 0.55 + M) {
    const isFront = x > 0;
    const surface = isFront ? "Wyświetlacz" : "Panel tylny";

    let vert = "środek";
    if (y > 0.5) vert = "góra";
    else if (y < -0.5) vert = "dół";

    let horiz = "środek";
    if (z > 0.22) horiz = "prawo";
    else if (z < -0.22) horiz = "lewo";

    let label;
    if (vert === "środek" && horiz === "środek") label = `${surface} — środek`;
    else if (vert === "środek") label = `${surface} — ${horiz}`;
    else if (horiz === "środek") label = `${surface} — ${vert}`;
    else label = `${surface} — ${vert}-${horiz}`;
    candidates.push(label);
  }

  // Deduplikacja zachowując kolejność.
  return Array.from(new Set(candidates));
}

/** Damage pin — perf-optimized. Bez pointLight (było drogie, każdy marker
 * wymuszał update shader uniformów na całej scenie). Bez 2 ringów — został
 * 1. Geometrie z mniej segmentów (8 zamiast 16/32). useFrame z throttle:
 * update co 2 frames + tylko gdy widoczny w viewport. */
function DamagePin({ x, y, z }: { x: number; y: number; z: number }) {
  const dotRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const frameCountRef = useRef(0);

  useFrame(({ clock, camera }) => {
    // Throttle: update animacji co 2 frame zamiast co 1 (50% mniej pracy).
    frameCountRef.current = (frameCountRef.current + 1) % 2;
    if (frameCountRef.current !== 0) return;

    const t = clock.getElapsedTime();
    const pulse = (Math.sin(t * 2.4) + 1) / 2;
    if (dotRef.current) dotRef.current.scale.setScalar(0.95 + pulse * 0.15);
    if (ringRef.current) {
      const r = (t * 0.6) % 1;
      ringRef.current.scale.setScalar(1 + r * 1.6);
      const m = ringRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = (1 - r) * 0.5;
    }
    if (groupRef.current) {
      groupRef.current.lookAt(camera.position);
    }
  });

  return (
    <group ref={groupRef} position={[x, y, z]}>
      <mesh ref={dotRef}>
        {/* segments 16→8 — dla mikrokropki różnica niewidoczna. */}
        <sphereGeometry args={[0.006, 8, 8]} />
        <meshStandardMaterial
          color="#ff2020"
          emissive={new THREE.Color("#ff0000")}
          emissiveIntensity={1.6}
          roughness={0.3}
        />
      </mesh>
      <mesh ref={ringRef}>
        {/* ringGeometry 32→16 segments. */}
        <ringGeometry args={[0.0085, 0.0107, 16]} />
        <meshBasicMaterial
          color="#ff3030"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
