"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Smukły, czarny, hiperrealistyczny model telefonu — proporcje nowoczesnego
 * flagowca. Wszystko z primitive geometry. Wyspa aparatów naturalna,
 * niewielka. Highlight przez delikatny pulsing point light + subtelne
 * emissive na materiale (0.05-0.18). */

export const PHONE_DIMENSIONS = {
  width: 1.5,
  height: 3.1,
  depth: 0.12, // smukłe — było 0.18
  cornerRadius: 0.42, // mniej kanciaste — było 0.32
  bezel: 0.05,
};

export type HighlightId =
  | null
  | "display"
  | "back"
  | "cameras"
  | "frames"
  | "earpiece"
  | "speakers"
  | "port";

/** Pozycje punktowych źródeł światła dla każdego highlight component. */
const HIGHLIGHT_POSITIONS: Record<Exclude<HighlightId, null>, [number, number, number]> = {
  display: [0, 0, 0.4],
  back: [0, 0, -0.4],
  cameras: [-0.32, 0.85, -0.45],
  frames: [0.85, 0, 0],
  earpiece: [0, 1.45, 0.18],
  speakers: [0, -1.5, 0.18],
  port: [0, -1.53, 0.0],
};

interface PhoneModelProps {
  highlight?: HighlightId;
  /** Akcent kolorystyczny — telefon zawsze czarny, brand wpływa tylko na
   *  ledwo widoczny tint tylnej szyby (subtelne odbicie). */
  brandColor?: string;
  screenOn?: boolean;
  damageMarkers?: { id: string; x: number; y: number; z: number; description?: string }[];
  onPointerMissed?: () => void;
  onModelClick?: (point: THREE.Vector3, surface: string) => void;
}

export function PhoneModel({
  highlight = null,
  brandColor = "#0a0a0a",
  screenOn = false,
  damageMarkers = [],
  onModelClick,
}: PhoneModelProps) {
  const D = PHONE_DIMENSIONS;
  const matRefs = useRef<Record<string, THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial | null>>({});
  const highlightLightRef = useRef<THREE.PointLight>(null);

  // Delikatny pulse dla emissive + point light intensity.
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = (Math.sin(t * 2.2) + 1) / 2; // 0..1, ~0.35 Hz wolniejszy niż wcześniej
    const intensityScale = 0.6 + pulse * 0.4; // 0.6..1.0

    // Subtelne emissive na faktycznym materiale (max 0.15 intensity).
    for (const [id, mat] of Object.entries(matRefs.current)) {
      if (!mat) continue;
      const isHighlighted = id === highlight;
      const targetIntensity = isHighlighted ? 0.06 + pulse * 0.12 : 0;
      if ("emissiveIntensity" in mat) {
        mat.emissiveIntensity = targetIntensity * 5;
      }
      if (isHighlighted) {
        mat.emissive = new THREE.Color(0xff3030);
      } else {
        mat.emissive = new THREE.Color(0, 0, 0);
      }
    }

    // Pulsujący punkt świetlny przy podświetlonym elemencie.
    if (highlightLightRef.current) {
      if (highlight) {
        const [x, y, z] = HIGHLIGHT_POSITIONS[highlight];
        highlightLightRef.current.position.set(x, y, z);
        highlightLightRef.current.intensity = 2.2 * intensityScale;
      } else {
        highlightLightRef.current.intensity = 0;
      }
    }
  });

  const handleClick = (e: { point: THREE.Vector3; stopPropagation: () => void }, surface: string) => {
    e.stopPropagation();
    onModelClick?.(e.point, surface);
  };

  // Telefon zawsze w czerni — brandColor parametr ignorowany (pozostawiony
  // dla backward compat, ale nie wpływa na wygląd).
  const backColor = 0x0a0a0a;
  void brandColor;

  return (
    <group>
      {/* === Punktowe światło highlightu (porusza się do aktualnego elementu) === */}
      <pointLight
        ref={highlightLightRef}
        color="#ff3030"
        distance={0.9}
        decay={1.6}
        intensity={0}
      />

      {/* === Korpus (czarny tytan / mat aluminum) === */}
      <RoundedBox
        args={[D.width, D.height, D.depth]}
        radius={D.cornerRadius}
        smoothness={12}
        bevelSegments={12}
        creaseAngle={0.4}
        onClick={(e) => handleClick(e, "frame")}
      >
        <meshPhysicalMaterial
          ref={(m) => {
            matRefs.current.frames = m as THREE.MeshPhysicalMaterial;
          }}
          color="#0a0a0a"
          metalness={0.85}
          roughness={0.38}
          clearcoat={0.5}
          clearcoatRoughness={0.18}
        />
      </RoundedBox>

      {/* === Display: ciemna szyba z mocnym clearcoat (lustrzane odbicie) === */}
      <mesh
        position={[0, 0, D.depth / 2 + 0.0008]}
        onClick={(e) => handleClick(e, "front")}
      >
        <planeGeometry args={[D.width - D.bezel * 2, D.height - D.bezel * 2]} />
        <meshPhysicalMaterial
          ref={(m) => {
            matRefs.current.display = m as THREE.MeshPhysicalMaterial;
          }}
          color={screenOn ? "#0a1230" : "#020203"}
          metalness={0.05}
          roughness={0.04}
          clearcoat={1.0}
          clearcoatRoughness={0.02}
          emissive={screenOn ? new THREE.Color(0.05, 0.08, 0.15) : new THREE.Color(0, 0, 0)}
          emissiveIntensity={screenOn ? 1.4 : 0}
        />
      </mesh>

      {/* === Notch / Dynamic Island (mała pillbox) === */}
      <mesh position={[0, D.height / 2 - 0.18, D.depth / 2 + 0.003]}>
        <RoundedBoxGeometry width={0.5} height={0.1} depth={0.004} radius={0.05} />
        <meshStandardMaterial color="#000" roughness={0.18} metalness={0.05} />
      </mesh>
      {/* Sensor + selfie camera */}
      <mesh position={[-0.16, D.height / 2 - 0.18, D.depth / 2 + 0.0042]}>
        <cylinderGeometry args={[0.014, 0.014, 0.004, 16]} rotation-x={Math.PI / 2} />
        <meshPhysicalMaterial color="#0a0a0a" roughness={0.05} metalness={0.4} clearcoat={1} />
      </mesh>
      <mesh position={[0.16, D.height / 2 - 0.18, D.depth / 2 + 0.0042]}>
        <cylinderGeometry args={[0.014, 0.014, 0.004, 16]} rotation-x={Math.PI / 2} />
        <meshPhysicalMaterial color="#0a0a0a" roughness={0.05} metalness={0.4} clearcoat={1} />
      </mesh>

      {/* === Tylna szyba (matowe szkło z subtelnym tintem) === */}
      <mesh
        position={[0, 0, -D.depth / 2 - 0.0008]}
        rotation={[0, Math.PI, 0]}
        onClick={(e) => handleClick(e, "back")}
      >
        <planeGeometry args={[D.width - D.bezel * 0.4, D.height - D.bezel * 0.4]} />
        <meshPhysicalMaterial
          ref={(m) => {
            matRefs.current.back = m as THREE.MeshPhysicalMaterial;
          }}
          color={backColor}
          metalness={0.7}
          roughness={0.55}
          clearcoat={0.7}
          clearcoatRoughness={0.15}
        />
      </mesh>

      {/* === Naturalna wyspa aparatów — kompaktowa, w stylu Pixel/iPhone === */}
      {/* Mniejsza i niżej osadzona płytka */}
      <group
        position={[-D.width / 2 + 0.36, D.height / 2 - 0.5, -D.depth / 2 - 0.05]}
        onClick={(e) => handleClick(e, "cameras")}
      >
        <RoundedBox args={[0.55, 0.55, 0.08]} radius={0.18} smoothness={8}>
          <meshPhysicalMaterial
            ref={(m) => {
              matRefs.current.cameras = m as THREE.MeshPhysicalMaterial;
            }}
            color="#0d0d0d"
            metalness={0.85}
            roughness={0.25}
            clearcoat={0.7}
            clearcoatRoughness={0.1}
          />
        </RoundedBox>
        {/* 3 obiektywy w układzie L — mniejsze i bardziej naturalne */}
        <Lens position={[-0.135, 0.13, -0.045]} radius={0.105} />
        <Lens position={[0.135, 0.13, -0.045]} radius={0.105} />
        <Lens position={[-0.135, -0.13, -0.045]} radius={0.105} />
        {/* Flash w 4. rogu */}
        <FlashOrSensor position={[0.135, -0.13, -0.043]} color="#fef3c7" emissive />
        {/* Mikrofon — mała kropka pomiędzy */}
        <mesh position={[0, 0, -0.043]}>
          <cylinderGeometry args={[0.011, 0.011, 0.005, 16]} />
          <meshStandardMaterial color="#000" roughness={0.3} />
        </mesh>
      </group>

      {/* === Głośnik rozmów (cienka szczelina pod krawędzią ekranu) === */}
      <mesh
        position={[0, D.height / 2 - 0.045, D.depth / 2 + 0.0005]}
        onClick={(e) => handleClick(e, "earpiece")}
      >
        <RoundedBoxGeometry width={0.36} height={0.018} depth={0.003} radius={0.008} />
        <meshStandardMaterial
          ref={(m) => {
            matRefs.current.earpiece = m as THREE.MeshStandardMaterial;
          }}
          color="#080808"
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>

      {/* === Głośniczki dolne — 6 cylindrów na stronę, mniejsze otwory === */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 0.42, -D.height / 2 + 0.012, 0]}
          onClick={(e) => handleClick(e, "speakers")}
        >
          {[...Array(6)].map((_, i) => (
            <mesh key={i} position={[(i - 2.5) * 0.04, 0, 0]}>
              <cylinderGeometry args={[0.011, 0.011, D.depth + 0.002, 16]} />
              <meshStandardMaterial
                ref={(m) => {
                  if (side === -1 && i === 0)
                    matRefs.current.speakers = m as THREE.MeshStandardMaterial;
                }}
                color="#0a0a0a"
                roughness={0.22}
                metalness={0.55}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* === USB-C port — bardziej proporcjonalny, ze ściankami === */}
      <mesh
        position={[0, -D.height / 2 + 0.012, 0]}
        onClick={(e) => handleClick(e, "port")}
      >
        <boxGeometry args={[0.32, 0.062, D.depth - 0.04]} />
        <meshStandardMaterial
          ref={(m) => {
            matRefs.current.port = m as THREE.MeshStandardMaterial;
          }}
          color="#070707"
          roughness={0.32}
          metalness={0.7}
        />
      </mesh>
      <mesh position={[0, -D.height / 2 + 0.012, 0]}>
        <boxGeometry args={[0.25, 0.018, 0.04]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.55} metalness={0.4} />
      </mesh>

      {/* === Subtelne przyciski boczne (bez antenna lines żeby było gładziej) === */}
      <SideButton position={[D.width / 2 + 0.003, 0.55, 0]} length={0.46} />
      <SideButton position={[-D.width / 2 - 0.003, 0.78, 0]} length={0.18} />
      <SideButton position={[-D.width / 2 - 0.003, 0.52, 0]} length={0.26} />

      {/* === Damage markers === */}
      {damageMarkers.map((m) => (
        <DamagePin key={m.id} x={m.x} y={m.y} z={m.z} />
      ))}
    </group>
  );
}

/** Soczewka aparatu — koncentryczne pierścienie, naturalniejszy rozmiar. */
function Lens({
  position,
  radius,
}: {
  position: [number, number, number];
  radius: number;
}) {
  return (
    <group position={position}>
      {/* Zewnętrzny pierścień (nieco wystający) */}
      <mesh>
        <torusGeometry args={[radius, radius * 0.16, 24, 48]} />
        <meshPhysicalMaterial
          color="#1a1a1a"
          metalness={0.9}
          roughness={0.32}
          clearcoat={0.6}
          clearcoatRoughness={0.12}
        />
      </mesh>
      {/* Czarne wnętrze */}
      <mesh position={[0, 0, -0.005]}>
        <cylinderGeometry args={[radius * 0.85, radius * 0.85, 0.025, 32]} />
        <meshStandardMaterial color="#020202" roughness={0.8} />
      </mesh>
      {/* Szkiełko */}
      <mesh position={[0, 0, 0.012]}>
        <cylinderGeometry args={[radius * 0.65, radius * 0.7, 0.015, 32]} />
        <meshPhysicalMaterial
          color="#080808"
          metalness={0.0}
          roughness={0.04}
          clearcoat={1.0}
          clearcoatRoughness={0.02}
          transmission={0.15}
          ior={1.7}
          emissive={new THREE.Color("#0a1530")}
          emissiveIntensity={0.18}
        />
      </mesh>
      {/* Aperture */}
      <mesh position={[0, 0, 0.022]}>
        <cylinderGeometry args={[radius * 0.16, radius * 0.16, 0.002, 24]} />
        <meshStandardMaterial color="#000" roughness={0.95} />
      </mesh>
      {/* Subtelny refleks (mniejszy, mniej "kreskówkowy") */}
      <mesh position={[radius * 0.28, radius * 0.28, 0.024]}>
        <circleGeometry args={[radius * 0.12, 16]} />
        <meshBasicMaterial color="#aaccee" transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

function FlashOrSensor({
  position,
  color,
  emissive,
}: {
  position: [number, number, number];
  color: string;
  emissive?: boolean;
}) {
  return (
    <mesh position={position}>
      <cylinderGeometry args={[0.05, 0.05, 0.025, 24]} />
      <meshStandardMaterial
        color={color}
        roughness={0.18}
        metalness={0.4}
        emissive={emissive ? new THREE.Color(color) : new THREE.Color(0, 0, 0)}
        emissiveIntensity={emissive ? 0.35 : 0}
      />
    </mesh>
  );
}

function SideButton({
  position,
  length,
}: {
  position: [number, number, number];
  length: number;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={[0.008, length, 0.05]} />
      <meshPhysicalMaterial
        color="#141414"
        metalness={0.92}
        roughness={0.3}
        clearcoat={0.5}
      />
    </mesh>
  );
}

/** Promieniujący czerwony marker uszkodzenia — kropka + 2 koncentryczne ringi. */
function DamagePin({ x, y, z }: { x: number; y: number; z: number }) {
  const dotRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = (Math.sin(t * 2.4) + 1) / 2; // 0..1
    if (dotRef.current) {
      dotRef.current.scale.setScalar(0.95 + pulse * 0.15);
    }
    if (ring1Ref.current) {
      const r1 = (t * 0.6) % 1; // 0..1 looping
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
      {/* Punkt świetlny — promieniowanie wokół kropki */}
      <pointLight
        ref={lightRef}
        color="#ff3030"
        distance={0.5}
        decay={1.8}
        intensity={0.5}
      />
      {/* Centralna czerwona kropka */}
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.025, 24, 24]} />
        <meshStandardMaterial
          color="#ff2020"
          emissive={new THREE.Color("#ff0000")}
          emissiveIntensity={1.4}
          roughness={0.3}
        />
      </mesh>
      {/* Ekspandujący pierścień #1 */}
      <mesh ref={ring1Ref}>
        <ringGeometry args={[0.035, 0.045, 32]} />
        <meshBasicMaterial
          color="#ff3030"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Ekspandujący pierścień #2 (offset fazowy) */}
      <mesh ref={ring2Ref}>
        <ringGeometry args={[0.035, 0.045, 32]} />
        <meshBasicMaterial
          color="#ff5050"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Glow halo — nieco większa kula z bardzo małym opacity */}
      <mesh>
        <sphereGeometry args={[0.06, 24, 24]} />
        <meshBasicMaterial color="#ff3030" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

/** Procedural rounded pillbox — używane dla notch i earpiece. */
function RoundedBoxGeometry({
  width,
  height,
  depth,
  radius,
}: {
  width: number;
  height: number;
  depth: number;
  radius: number;
}) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    const w = width / 2;
    const h = height / 2;
    const r = Math.min(radius, w, h);
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);
    return new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 24,
    });
  }, [width, height, depth, radius]);
  return <primitive object={geom} attach="geometry" />;
}

/** Animowana kamera. */
export function CameraRig({
  position,
  lookAt,
  lerpLambda = 2.0,
}: {
  position: [number, number, number];
  lookAt?: [number, number, number];
  /** Szybkość exponential lerp (1/sekunda). Większy = szybszy. Damp formula
   * `1 - exp(-lambda * dt)` czyta aktualną pozycję kamery jako start, lerpuje
   * do target. Naturalne "przyspieszanie z bieżącego punktu" — kamera od razu
   * rusza w kierunku celu, zwalnia gdy się zbliża. Cleaning używa 0.8 dla
   * cinematic feel; default 2.0. */
  lerpLambda?: number;
}) {
  const { camera } = useThree();
  const tgtPos = useRef(new THREE.Vector3(...position));
  const tgtLook = useRef(new THREE.Vector3(...(lookAt ?? [0, 0, 0])));

  if (
    tgtPos.current.x !== position[0] ||
    tgtPos.current.y !== position[1] ||
    tgtPos.current.z !== position[2]
  ) {
    tgtPos.current.set(...position);
  }
  if (lookAt) {
    if (
      tgtLook.current.x !== lookAt[0] ||
      tgtLook.current.y !== lookAt[1] ||
      tgtLook.current.z !== lookAt[2]
    ) {
      tgtLook.current.set(...lookAt);
    }
  }

  useFrame((_, dt) => {
    // Zawsze startujemy od bieżącej pozycji kamery (lerp z current → target).
    // Frame-rate independent: 1 - exp(-λ·dt). Brak fixed duration, brak
    // pre-determined startPos — tylko płynne dążenie do celu.
    const k = 1 - Math.exp(-lerpLambda * dt);
    camera.position.lerp(tgtPos.current, k);
    camera.lookAt(tgtLook.current);
  });
  return null;
}
