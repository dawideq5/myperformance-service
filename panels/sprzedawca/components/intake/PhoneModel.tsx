"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Hiperrealistyczny model telefonu w stylu nowoczesnego flagowca (proporcje
 * ~iPhone 15 Pro / Galaxy S24 Ultra). Wszystko z primitive geometry — brak
 * GLB. Materiały PBR (MeshPhysicalMaterial dla szkła, MeshStandardMaterial
 * z wysokim metalness dla ramek i szczotkowanej obudowy). */

export const PHONE_DIMENSIONS = {
  width: 1.5, // ~76 mm
  height: 3.1, // ~158 mm
  depth: 0.18, // ~9 mm
  cornerRadius: 0.32,
  bezel: 0.045,
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

interface PhoneModelProps {
  highlight?: HighlightId;
  brandColor?: string;
  /** Włącza świecący ekran z treścią (true = display ON, false = OFF/black). */
  screenOn?: boolean;
  /** Treść do narysowania na "włączonym" ekranie (HTML overlay przez parent). */
  screenChildren?: React.ReactNode;
  /** Markery uszkodzeń. */
  damageMarkers?: { id: string; x: number; y: number; z: number; description?: string }[];
  /** Klik w model (raycaster) — używane do dodawania markerów. */
  onPointerMissed?: () => void;
  onModelClick?: (point: THREE.Vector3, surface: string) => void;
}

function emissiveForId(target: HighlightId, current: HighlightId, t: number) {
  if (target == null || current !== target) return new THREE.Color(0, 0, 0);
  const pulse = (Math.sin(t * 4) + 1) / 2;
  return new THREE.Color(0.3 + pulse * 0.6, 0, 0);
}

export function PhoneModel({
  highlight = null,
  brandColor = "#1f2937",
  screenOn = false,
  damageMarkers = [],
  onModelClick,
}: PhoneModelProps) {
  const D = PHONE_DIMENSIONS;
  const matRefs = useRef<Record<string, THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial | null>>({});

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (const [id, mat] of Object.entries(matRefs.current)) {
      if (!mat) continue;
      const color = emissiveForId(id as HighlightId, highlight, t);
      mat.emissive = color;
      // For physical material — boost emissive intensity when highlighted.
      if ("emissiveIntensity" in mat) {
        const m = mat as THREE.MeshPhysicalMaterial;
        m.emissiveIntensity = highlight === id ? 1.4 : 1;
      }
    }
  });

  const handleClick = (e: { point: THREE.Vector3; stopPropagation: () => void }, surface: string) => {
    e.stopPropagation();
    onModelClick?.(e.point, surface);
  };

  return (
    <group>
      {/* === Aluminiowa rama (titanium-like brushed metal) === */}
      {/* Sub-surface frame: nieco mniejsze niż body, definiuje ramki boczne */}
      <RoundedBox
        args={[D.width, D.height, D.depth]}
        radius={D.cornerRadius}
        smoothness={8}
        bevelSegments={6}
        creaseAngle={0.4}
        onClick={(e) => handleClick(e, "frame")}
      >
        <meshPhysicalMaterial
          ref={(m) => {
            matRefs.current.frames = m as THREE.MeshPhysicalMaterial;
          }}
          color={brandColor}
          metalness={0.95}
          roughness={0.32}
          clearcoat={0.4}
          clearcoatRoughness={0.18}
        />
      </RoundedBox>

      {/* === Linie antenowe (subtelne ciemne paski na ramce — iPhone-style) === */}
      {[D.height / 2 - 0.15, -D.height / 2 + 0.15].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <torusGeometry
            args={[
              Math.sqrt(
                (D.width / 2) ** 2 + (D.depth / 2) ** 2,
              ),
              0.005,
              4,
              64,
            ]}
          />
          <meshStandardMaterial color="#0f0f0f" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}

      {/* === Display: czarne/ciemne szkło z subtelną odbijającą warstwą === */}
      <mesh
        position={[0, 0, D.depth / 2 + 0.001]}
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
          transparent
          opacity={1}
        />
      </mesh>

      {/* === Notch / Dynamic Island — subtelny czarny pillbox === */}
      <mesh position={[0, D.height / 2 - 0.18, D.depth / 2 + 0.0035]}>
        <RoundedBoxGeometry width={0.55} height={0.11} depth={0.005} radius={0.05} />
        <meshStandardMaterial color="#000" roughness={0.2} metalness={0.1} />
      </mesh>
      {/* Sensor + selfie camera dots inside notch */}
      <mesh position={[-0.18, D.height / 2 - 0.18, D.depth / 2 + 0.0045]}>
        <cylinderGeometry args={[0.018, 0.018, 0.005, 16]} rotation-x={Math.PI / 2} />
        <meshPhysicalMaterial color="#0a0a0a" roughness={0.05} metalness={0.5} clearcoat={1} />
      </mesh>
      <mesh position={[0.18, D.height / 2 - 0.18, D.depth / 2 + 0.0045]}>
        <cylinderGeometry args={[0.018, 0.018, 0.005, 16]} rotation-x={Math.PI / 2} />
        <meshPhysicalMaterial color="#0a0a0a" roughness={0.05} metalness={0.5} clearcoat={1} />
      </mesh>

      {/* === Tylna szyba (matowe szkło z gradientowym kolorem) === */}
      <mesh
        position={[0, 0, -D.depth / 2 - 0.001]}
        rotation={[0, Math.PI, 0]}
        onClick={(e) => handleClick(e, "back")}
      >
        <planeGeometry args={[D.width - D.bezel * 0.5, D.height - D.bezel * 0.5]} />
        <meshPhysicalMaterial
          ref={(m) => {
            matRefs.current.back = m as THREE.MeshPhysicalMaterial;
          }}
          color={brandColor}
          metalness={0.85}
          roughness={0.42}
          clearcoat={0.5}
          clearcoatRoughness={0.2}
        />
      </mesh>

      {/* === Wyspa aparatów (camera island) — top-left róg, podniesiona === */}
      <group
        position={[-D.width / 2 + 0.42, D.height / 2 - 0.5, -D.depth / 2 - 0.07]}
        onClick={(e) => handleClick(e, "cameras")}
      >
        {/* Płytka wyspy — ciemne szczotkowane */}
        <RoundedBox
          args={[0.65, 0.65, 0.13]}
          radius={0.16}
          smoothness={6}
        >
          <meshPhysicalMaterial
            ref={(m) => {
              matRefs.current.cameras = m as THREE.MeshPhysicalMaterial;
            }}
            color="#161616"
            metalness={0.9}
            roughness={0.28}
            clearcoat={0.7}
            clearcoatRoughness={0.12}
          />
        </RoundedBox>
        {/* 3 obiektywy + flash w układzie L */}
        <Lens position={[-0.16, 0.16, -0.073]} radius={0.13} />
        <Lens position={[0.16, 0.16, -0.073]} radius={0.13} />
        <Lens position={[-0.16, -0.16, -0.073]} radius={0.13} />
        {/* Flash + LiDAR */}
        <FlashOrSensor position={[0.16, -0.16, -0.07]} color="#fef3c7" emissive />
        {/* Mikrofon */}
        <mesh position={[0, 0, -0.072]}>
          <cylinderGeometry args={[0.012, 0.012, 0.007, 16]} />
          <meshStandardMaterial color="#000" roughness={0.3} />
        </mesh>
      </group>

      {/* === Głośnik rozmów (earpiece) — wąska szczelina na górze ekranu === */}
      <mesh
        position={[0, D.height / 2 - 0.05, D.depth / 2 + 0.0005]}
        onClick={(e) => handleClick(e, "earpiece")}
      >
        <boxGeometry args={[0.42, 0.024, 0.003]} />
        <meshStandardMaterial
          ref={(m) => {
            matRefs.current.earpiece = m as THREE.MeshStandardMaterial;
          }}
          color="#0a0a0a"
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>

      {/* === Głośniczki dolne (lewy + prawy) — perforacja z 7 otworów === */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 0.43, -D.height / 2 + 0.012, 0]}
          onClick={(e) => handleClick(e, "speakers")}
        >
          {[...Array(7)].map((_, i) => (
            <mesh key={i} position={[(i - 3) * 0.038, 0, 0]}>
              <cylinderGeometry args={[0.013, 0.013, D.depth + 0.002, 16]} />
              <meshStandardMaterial
                ref={(m) => {
                  if (side === -1 && i === 0)
                    matRefs.current.speakers = m as THREE.MeshStandardMaterial;
                }}
                color="#0a0a0a"
                roughness={0.25}
                metalness={0.6}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* === USB-C / Lightning port (środek dolnej krawędzi) === */}
      <mesh
        position={[0, -D.height / 2 + 0.012, 0]}
        onClick={(e) => handleClick(e, "port")}
      >
        <boxGeometry args={[0.34, 0.075, D.depth - 0.04]} />
        <meshStandardMaterial
          ref={(m) => {
            matRefs.current.port = m as THREE.MeshStandardMaterial;
          }}
          color="#080808"
          roughness={0.32}
          metalness={0.7}
        />
      </mesh>
      {/* USB-C wewnętrzny "język" konektora */}
      <mesh position={[0, -D.height / 2 + 0.012, 0]}>
        <boxGeometry args={[0.27, 0.022, 0.04]} />
        <meshStandardMaterial color="#0d0d0d" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* === Przyciski boczne (volume + power) === */}
      <SideButton position={[D.width / 2 + 0.005, 0.55, 0]} length={0.5} side="right" />
      <SideButton position={[-D.width / 2 - 0.005, 0.85, 0]} length={0.18} side="left" />
      <SideButton position={[-D.width / 2 - 0.005, 0.6, 0]} length={0.3} side="left" />
      <SideButton position={[-D.width / 2 - 0.005, 0.18, 0]} length={0.04} side="left" />

      {/* === Action button slot (iPhone-15 style) — mała wnęka === */}
      <mesh position={[-D.width / 2 - 0.001, 1.0, 0]}>
        <boxGeometry args={[0.005, 0.18, 0.075]} />
        <meshStandardMaterial color="#000" roughness={0.45} metalness={0.6} />
      </mesh>

      {/* === Damage markers === */}
      {damageMarkers.map((m) => (
        <DamagePin key={m.id} x={m.x} y={m.y} z={m.z} />
      ))}
    </group>
  );
}

/** Soczewka aparatu — koncentryczne pierścienie z głębokością + szkiełko. */
function Lens({
  position,
  radius,
}: {
  position: [number, number, number];
  radius: number;
}) {
  return (
    <group position={position}>
      {/* Zewnętrzny pierścień metalowy */}
      <mesh>
        <torusGeometry args={[radius, radius * 0.18, 24, 48]} />
        <meshPhysicalMaterial
          color="#2a2a2a"
          metalness={0.95}
          roughness={0.28}
          clearcoat={0.8}
          clearcoatRoughness={0.1}
        />
      </mesh>
      {/* Czarne wnętrze obudowy soczewki */}
      <mesh position={[0, 0, -0.005]}>
        <cylinderGeometry args={[radius * 0.85, radius * 0.85, 0.04, 32]} />
        <meshStandardMaterial color="#020202" roughness={0.6} />
      </mesh>
      {/* Szkiełko obiektywu — głębokie z reflective pattern */}
      <mesh position={[0, 0, 0.012]}>
        <cylinderGeometry args={[radius * 0.65, radius * 0.7, 0.02, 32]} />
        <meshPhysicalMaterial
          color="#0a0a0a"
          metalness={0.0}
          roughness={0.04}
          clearcoat={1.0}
          clearcoatRoughness={0.02}
          transmission={0.2}
          ior={1.7}
          emissive={new THREE.Color("#1a3a5e")}
          emissiveIntensity={0.15}
        />
      </mesh>
      {/* Mała aperture w środku — iris dot */}
      <mesh position={[0, 0, 0.022]}>
        <cylinderGeometry args={[radius * 0.18, radius * 0.18, 0.003, 24]} />
        <meshStandardMaterial color="#000" roughness={0.95} />
      </mesh>
      {/* Highlight — sztuczny anaflektyczny "blik" */}
      <mesh position={[radius * 0.25, radius * 0.25, 0.025]}>
        <cylinderGeometry args={[radius * 0.1, radius * 0.1, 0.001, 16]} />
        <meshBasicMaterial color="#88aaff" transparent opacity={0.45} />
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
      <cylinderGeometry args={[0.07, 0.07, 0.04, 24]} />
      <meshStandardMaterial
        color={color}
        roughness={0.2}
        metalness={0.4}
        emissive={emissive ? new THREE.Color(color) : new THREE.Color(0, 0, 0)}
        emissiveIntensity={emissive ? 0.5 : 0}
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
  side?: "left" | "right";
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={[0.012, length, 0.075]} />
      <meshPhysicalMaterial
        color="#1a1a1a"
        metalness={0.92}
        roughness={0.3}
        clearcoat={0.5}
      />
    </mesh>
  );
}

function DamagePin({ x, y, z }: { x: number; y: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.15;
    ref.current.scale.setScalar(s);
  });
  return (
    <group position={[x, y, z]}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshStandardMaterial
          color="#ff3030"
          emissive={new THREE.Color("#ff0000")}
          emissiveIntensity={0.8}
          roughness={0.3}
        />
      </mesh>
      <mesh>
        <ringGeometry args={[0.05, 0.07, 32]} />
        <meshBasicMaterial color="#ff3030" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Mała procedural geometry helper dla notch-pillbox (drei RoundedBox jest 3D,
 * tu chcemy płaski pillbox). */
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

/** Camera animator — interpolacja pozycji + lookAt. */
export function CameraRig({
  position,
  lookAt,
}: {
  position: [number, number, number];
  lookAt?: [number, number, number];
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
    camera.position.lerp(tgtPos.current, Math.min(dt * 2.0, 1));
    camera.lookAt(tgtLook.current);
  });
  return null;
}
