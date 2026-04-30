"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false },
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false },
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false },
);
const Polyline = dynamic(
  () => import("react-leaflet").then((m) => m.Polyline),
  { ssr: false },
);
const Tooltip = dynamic(
  () => import("react-leaflet").then((m) => m.Tooltip),
  { ssr: false },
);
const FitBounds = dynamic(
  () =>
    import("react-leaflet").then((m) => {
      function Comp({ points }: { points: Array<[number, number]> }) {
        const map = m.useMap();
        useEffect(() => {
          if (points.length === 0) return;
          if (points.length === 1) {
            map.flyTo(points[0], 12, { duration: 0.5 });
            return;
          }
          // Compute bounds manually to avoid leaflet types in dynamic import.
          const lats = points.map((p) => p[0]);
          const lngs = points.map((p) => p[1]);
          const sw: [number, number] = [Math.min(...lats), Math.min(...lngs)];
          const ne: [number, number] = [Math.max(...lats), Math.max(...lngs)];
          map.flyToBounds([sw, ne], { padding: [40, 40], duration: 0.5 });
        }, [map, points]);
        return null;
      }
      return Comp;
    }),
  { ssr: false },
);
const ResizeFix = dynamic(
  () =>
    import("react-leaflet").then((m) => {
      function Comp() {
        const map = m.useMap();
        useEffect(() => {
          const t1 = setTimeout(() => map.invalidateSize(), 120);
          const t2 = setTimeout(() => map.invalidateSize(), 600);
          const onR = () => map.invalidateSize();
          window.addEventListener("resize", onR);
          return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            window.removeEventListener("resize", onR);
          };
        }, [map]);
        return null;
      }
      return Comp;
    }),
  { ssr: false },
);

const DARK_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '<a href="https://carto.com/attributions">CARTO</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const STATUS_COLOR: Record<string, string> = {
  queued: "#F59E0B",
  assigned: "#0EA5E9",
  in_transit: "#A855F7",
  delivered: "#22C55E",
  cancelled: "#64748B",
};

export interface MapJob {
  id: string;
  jobNumber: string;
  status: string;
  kind: string;
  source: { lat: number; lng: number; name: string } | null;
  dest: { lat: number; lng: number; name: string } | null;
}

export function DriverMap({
  jobs,
  selectedId,
  onSelect,
  routeOrder,
  className,
}: {
  jobs: MapJob[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Lista jobIds w optymalnej kolejności (z auto-planowania).
   * Gdy podana, rysujemy linię łączącą źródła w tej kolejności. */
  routeOrder?: string[];
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    void Promise.all([
      // @ts-expect-error — CSS side-effect bez typów
      import("leaflet/dist/leaflet.css"),
      import("leaflet"),
    ]).then(([, L]) => {
      const Lroot = (L as unknown as { default: typeof import("leaflet") })
        .default ?? L;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (Lroot.Icon.Default.prototype as any)._getIconUrl;
      Lroot.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      setMounted(true);
    });
  }, []);

  const allPoints = useMemo<Array<[number, number]>>(() => {
    const pts: Array<[number, number]> = [];
    for (const j of jobs) {
      if (j.source) pts.push([j.source.lat, j.source.lng]);
      if (j.dest) pts.push([j.dest.lat, j.dest.lng]);
    }
    return pts;
  }, [jobs]);

  const selected = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  const routeSegments = useMemo(() => {
    if (!routeOrder || routeOrder.length < 2) return [];
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const segments: Array<{
      from: [number, number];
      to: [number, number];
    }> = [];
    let prev: [number, number] | null = null;
    for (const id of routeOrder) {
      const j = byId.get(id);
      if (!j?.source) continue;
      const cur: [number, number] = [j.source.lat, j.source.lng];
      if (prev) segments.push({ from: prev, to: cur });
      if (j.dest) {
        segments.push({ from: cur, to: [j.dest.lat, j.dest.lng] });
        prev = [j.dest.lat, j.dest.lng];
      } else {
        prev = cur;
      }
    }
    return segments;
  }, [routeOrder, jobs]);

  if (!mounted) {
    return (
      <div
        className={`rounded-2xl border ${className ?? ""}`}
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          minHeight: 400,
        }}
      >
        <div className="flex items-center justify-center h-full">
          <div className="animate-pulse text-xs" style={{ color: "var(--text-muted)" }}>
            Ładowanie mapy…
          </div>
        </div>
      </div>
    );
  }

  const center: [number, number] =
    allPoints.length > 0 ? allPoints[0] : [52.0693, 19.4803]; // Polska center fallback

  return (
    <div
      className={`rounded-2xl border overflow-hidden ${className ?? ""}`}
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <MapContainer
        center={center}
        zoom={6}
        style={{ height: "100%", width: "100%", minHeight: 400 }}
      >
        <TileLayer url={DARK_TILE_URL} attribution={TILE_ATTR} />
        <ResizeFix />
        <FitBounds points={allPoints} />

        {/* Pulsujące źródła — wszystkie zlecenia. */}
        {jobs.map((j) => {
          if (!j.source) return null;
          const color = STATUS_COLOR[j.status] ?? "#64748B";
          const isSel = j.id === selectedId;
          return (
            <CircleMarker
              key={`src-${j.id}`}
              center={[j.source.lat, j.source.lng]}
              radius={isSel ? 12 : 8}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: isSel ? 0.7 : 0.4,
                weight: isSel ? 3 : 2,
              }}
              eventHandlers={{
                click: () => onSelect(isSel ? null : j.id),
              }}
            >
              <Tooltip>
                <div className="text-xs">
                  <strong>{j.jobNumber}</strong>
                  <br />
                  {j.source.name}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Wybrane zlecenie: pinezka źródła + dest + dashed łuk. */}
        {selected?.source && (
          <Marker position={[selected.source.lat, selected.source.lng]}>
            <Tooltip permanent direction="top" offset={[0, -36]}>
              <strong>Start</strong> — {selected.source.name}
            </Tooltip>
          </Marker>
        )}
        {selected?.dest && (
          <Marker position={[selected.dest.lat, selected.dest.lng]}>
            <Tooltip permanent direction="top" offset={[0, -36]}>
              <strong>Cel</strong> — {selected.dest.name}
            </Tooltip>
          </Marker>
        )}
        {selected?.source && selected?.dest && (
          <Polyline
            positions={[
              [selected.source.lat, selected.source.lng],
              [selected.dest.lat, selected.dest.lng],
            ]}
            pathOptions={{
              color: STATUS_COLOR[selected.status] ?? "#0EA5E9",
              weight: 3,
              dashArray: "8 8",
            }}
          />
        )}

        {/* Trasa auto-planowania. */}
        {routeSegments.map((seg, i) => (
          <Polyline
            key={`route-${i}`}
            positions={[seg.from, seg.to]}
            pathOptions={{
              color: "#22C55E",
              weight: 4,
              opacity: 0.7,
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
