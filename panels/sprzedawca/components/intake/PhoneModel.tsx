"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/** Stylizowany model telefonu — bryła + kamery + przycisk + porty.
 * Wszystko z primitive geometry; brak GLB. Komponenty nazwane (highlightId)
 * można wskazać jako podświetlone — wtedy mrugają delikatnie na czerwono. */

export const PHONE_DIMENSIONS = {
  width: 1.5,
  height: 3.0,
  depth: 0.18,
  radius: 0.18,
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
}

function emissiveForId(target: HighlightId, current: HighlightId, t: number) {
  if (target == null || current !== target) return new THREE.Color(0, 0, 0);
  // Pulsing red between 0.0 and 0.6 intensity.
  const pulse = (Math.sin(t * 4) + 1) / 2;
  const intensity = 0.2 + pulse * 0.5;
  return new THREE.Color(intensity, 0, 0);
}

function RoundedBoxGeom({
  width,
  height,
  depth,
  radius,
  segments = 4,
}: {
  width: number;
  height: number;
  depth: number;
  radius: number;
  segments?: number;
}) {
  // Three.js core nie ma RoundedBox; mała implementacja przez ExtrudeGeometry.
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
    const extrudeSettings = {
      steps: 1,
      depth,
      bevelEnabled: true,
      bevelThickness: depth * 0.15,
      bevelSize: depth * 0.15,
      bevelSegments: segments,
      curveSegments: segments * 4,
    };
    const g = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    g.translate(0, 0, -depth / 2);
    return g;
  }, [width, height, depth, radius, segments]);
  return <primitive object={geom} attach="geometry" />;
}

export function PhoneModel({ highlight = null, brandColor = "#1a1a1a" }: PhoneModelProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Mrugające materiały — re-evaluate emissive every frame for highlighted part.
  const matRefs = useRef<Record<string, THREE.MeshStandardMaterial | null>>({});

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (const [id, mat] of Object.entries(matRefs.current)) {
      if (!mat) continue;
      const color = emissiveForId(id as HighlightId, highlight, t);
      mat.emissive = color;
    }
  });

  const D = PHONE_DIMENSIONS;
  const screenInset = 0.06;

  return (
    <group ref={groupRef}>
      {/* Body / frame (highlighted on "frames" step) */}
      <mesh castShadow receiveShadow>
        <RoundedBoxGeom
          width={D.width}
          height={D.height}
          depth={D.depth}
          radius={D.radius}
        />
        <meshStandardMaterial
          ref={(m) => {
            matRefs.current.frames = m;
          }}
          color={brandColor}
          roughness={0.42}
          metalness={0.6}
        />
      </mesh>

      {/* Display front (z = depth/2 + 0.001) */}
      <mesh position={[0, 0, D.depth / 2 + 0.001]}>
        <planeGeometry
          args={[D.width - screenInset * 2, D.height - screenInset * 2]}
        />
        <meshStandardMaterial
          ref={(m) => {
            matRefs.current.display = m;
          }}
          color="#0a0a0a"
          roughness={0.05}
          metalness={0.1}
          emissive={new THREE.Color(0.04, 0.05, 0.08)}
        />
      </mesh>

      {/* Back surface */}
      <mesh
        position={[0, 0, -D.depth / 2 - 0.001]}
        rotation={[0, Math.PI, 0]}
      >
        <planeGeometry
          args={[D.width - screenInset * 2, D.height - screenInset * 2]}
        />
        <meshStandardMaterial
          ref={(m) => {
            matRefs.current.back = m;
          }}
          color={brandColor}
          roughness={0.45}
          metalness={0.55}
        />
      </mesh>

      {/* Camera island — small rounded box on back, top-left corner */}
      <group position={[-D.width / 2 + 0.4, D.height / 2 - 0.45, -D.depth / 2 - 0.04]}>
        <mesh>
          <RoundedBoxGeom width={0.55} height={0.55} depth={0.08} radius={0.12} />
          <meshStandardMaterial
            ref={(m) => {
              matRefs.current.cameras = m;
            }}
            color="#1a1a1a"
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
        {/* 3 lens circles + flash */}
        {[
          [-0.13, 0.12],
          [0.13, 0.12],
          [-0.13, -0.12],
        ].map(([x, y], i) => (
          <mesh key={i} position={[x, y, -0.06]}>
            <cylinderGeometry args={[0.09, 0.09, 0.04, 32]} rotation-x={Math.PI / 2} />
            <meshStandardMaterial color="#222" roughness={0.2} metalness={0.85} />
          </mesh>
        ))}
        <mesh position={[0.13, -0.12, -0.05]}>
          <cylinderGeometry args={[0.045, 0.045, 0.02, 24]} />
          <meshStandardMaterial
            color="#fffbe7"
            emissive={new THREE.Color(0.5, 0.45, 0.2)}
          />
        </mesh>
      </group>

      {/* Earpiece (top edge near front) */}
      <mesh position={[0, D.height / 2 - 0.15, D.depth / 2 + 0.002]}>
        <boxGeometry args={[0.4, 0.04, 0.005]} />
        <meshStandardMaterial
          ref={(m) => {
            matRefs.current.earpiece = m;
          }}
          color="#101010"
          roughness={0.25}
          metalness={0.6}
        />
      </mesh>

      {/* Bottom speakers (left + right of port) */}
      {[-0.45, 0.45].map((x) => (
        <group key={x} position={[x, -D.height / 2 + 0.03, 0]}>
          {[...Array(5)].map((_, i) => (
            <mesh key={i} position={[(i - 2) * 0.04, 0, D.depth / 2 - 0.001]}>
              <cylinderGeometry args={[0.018, 0.018, 0.02, 12]} />
              <meshStandardMaterial
                ref={(m) => {
                  if (x === -0.45 && i === 0)
                    matRefs.current.speakers = m;
                }}
                color="#0a0a0a"
                roughness={0.2}
                metalness={0.7}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* USB-C / lightning port (bottom center) */}
      <mesh position={[0, -D.height / 2 + 0.005, 0]}>
        <boxGeometry args={[0.32, 0.07, 0.06]} />
        <meshStandardMaterial
          ref={(m) => {
            matRefs.current.port = m;
          }}
          color="#1a1a1a"
          roughness={0.3}
          metalness={0.6}
        />
      </mesh>

      {/* Volume / power buttons — visual detail on right edge */}
      <mesh position={[D.width / 2 - 0.005, 0.5, 0]}>
        <boxGeometry args={[0.04, 0.45, 0.07]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.45} metalness={0.7} />
      </mesh>
      <mesh position={[-D.width / 2 + 0.005, 0.7, 0]}>
        <boxGeometry args={[0.04, 0.25, 0.07]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.45} metalness={0.7} />
      </mesh>
      <mesh position={[-D.width / 2 + 0.005, 0.3, 0]}>
        <boxGeometry args={[0.04, 0.25, 0.07]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.45} metalness={0.7} />
      </mesh>
    </group>
  );
}

/** Camera animator — interpolacja kamery do `target` po każdej zmianie step. */
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

  // Refresh target jeśli prop się zmienił.
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
    camera.position.lerp(tgtPos.current, Math.min(dt * 2.4, 1));
    const desired = new THREE.Vector3(0, 0, 0).copy(tgtLook.current);
    const cur = new THREE.Vector3();
    camera.getWorldDirection(cur);
    // Smoothly look at target via lookAt with eased target position.
    camera.lookAt(desired);
  });
  return null;
}
