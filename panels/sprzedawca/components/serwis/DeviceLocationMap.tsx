"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Truck, AlertCircle, Loader2 } from "lucide-react";

/**
 * Wave 21 Faza 1A — DeviceLocationMap.
 *
 * Pokazuje gdzie aktualnie znajduje się urządzenie objęte zleceniem:
 *  - jeśli jest aktywny transport job (queued/assigned/in_transit) →
 *    polyline od source do destination + marker pośredni (środek drogi).
 *  - jeśli najnowszy job ma status `delivered` → marker destination.
 *  - jeśli nie ma transport joba → marker `serviceLocationId` lub `locationId`.
 *  - brak danych geo → empty state.
 *
 * Mapa używa react-leaflet (już w sprzedawca deps). SSR off (dynamic import).
 * A11y: aria-label na kontenerze + role="region".
 */

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
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false },
);
const Polyline = dynamic(
  () => import("react-leaflet").then((m) => m.Polyline),
  { ssr: false },
);
const ResizeFix = dynamic(
  () =>
    import("react-leaflet").then((m) => {
      function Comp() {
        const map = m.useMap();
        useEffect(() => {
          const t1 = setTimeout(() => map.invalidateSize(), 100);
          const t2 = setTimeout(() => map.invalidateSize(), 600);
          const onResize = () => map.invalidateSize();
          window.addEventListener("resize", onResize);
          return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            window.removeEventListener("resize", onResize);
          };
        }, [map]);
        return null;
      }
      return Comp;
    }),
  { ssr: false },
);
const FitBounds = dynamic(
  () =>
    import("react-leaflet").then((m) => {
      function Comp({
        points,
      }: {
        points: Array<[number, number]>;
      }) {
        const map = m.useMap();
        useEffect(() => {
          if (points.length === 0) return;
          if (points.length === 1) {
            map.setView(points[0], 13, { animate: true });
            return;
          }
          map.fitBounds(points, { padding: [32, 32], maxZoom: 14 });
        }, [points, map]);
        return null;
      }
      return Comp;
    }),
  { ssr: false },
);

const DARK_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const DARK_TILE_ATTRIBUTION =
  '<a href="https://carto.com/attributions">CARTO</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

interface PanelLocationLite {
  id: string;
  name: string;
  type?: "sales" | "service" | string;
  address?: string | null;
  lat: number | null;
  lng: number | null;
}

interface TransportJobLite {
  id: string;
  jobNumber: string;
  status: string;
  serviceId: string | null;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  destinationAddress: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
}

interface MapPlan {
  kind: "static" | "transport_active" | "transport_delivered" | "empty";
  source?: { lat: number; lng: number; name: string; address?: string | null };
  destination?: {
    lat: number;
    lng: number;
    name: string;
    address?: string | null;
  };
  current?: {
    lat: number;
    lng: number;
    label: string;
  };
  job?: TransportJobLite;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Zaplanowany odbiór",
  assigned: "Przypisany kierowca",
  in_transit: "W drodze",
  delivered: "Dostarczone",
  cancelled: "Anulowane",
};

function pickActiveJob(jobs: TransportJobLite[]): TransportJobLite | null {
  // Priorytet: in_transit > assigned > queued > delivered (najnowszy).
  const order = ["in_transit", "assigned", "queued"];
  for (const s of order) {
    const found = jobs.find((j) => j.status === s);
    if (found) return found;
  }
  return null;
}

function midpoint(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): { lat: number; lng: number } {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

export function DeviceLocationMap({
  serviceId,
  locationId,
  serviceLocationId,
  refreshKey = 0,
  className,
}: {
  serviceId: string;
  locationId: string | null;
  serviceLocationId: string | null;
  /** Bumpowane przez parent przy SSE `transport_job_*` / `service_updated`
   *  żeby wymusić re-fetch transport jobs i locations. */
  refreshKey?: number;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<TransportJobLite[]>([]);
  const [locationsById, setLocationsById] = useState<
    Record<string, PanelLocationLite>
  >({});

  // Inicjalizacja Leaflet — domyślne ikony marker (muszą być wczytane
  // ręcznie bo Webpack nie kopiuje plików z node_modules/leaflet/dist).
  useEffect(() => {
    void Promise.all([
      // @ts-expect-error — CSS module side-effect, brak TS types
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
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      setMounted(true);
    });
  }, []);

  // Fetch transport jobs + locations.
  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [rJobs, rLoc] = await Promise.all([
          fetch(
            `/api/relay/transport-jobs?serviceId=${encodeURIComponent(serviceId)}` +
              `&status=queued,assigned,in_transit,delivered`,
          ),
          fetch("/api/relay/locations"),
        ]);
        const jJobs = (await rJobs.json().catch(() => ({}))) as {
          jobs?: TransportJobLite[];
          error?: string;
        };
        const jLoc = (await rLoc.json().catch(() => ({}))) as {
          locations?: PanelLocationLite[];
          error?: string;
        };
        if (!alive) return;
        if (!rJobs.ok && rJobs.status !== 404) {
          setError(jJobs.error ?? `transport-jobs HTTP ${rJobs.status}`);
        }
        const jobList = Array.isArray(jJobs.jobs) ? jJobs.jobs : [];
        const locs = Array.isArray(jLoc.locations) ? jLoc.locations : [];
        const byId: Record<string, PanelLocationLite> = {};
        for (const l of locs) byId[l.id] = l;
        setJobs(jobList);
        setLocationsById(byId);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Błąd sieci");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [serviceId, refreshKey]);

  const plan = useMemo<MapPlan>(() => {
    // Priorytet 1: aktywny transport job (queued/assigned/in_transit).
    const active = pickActiveJob(jobs);
    const delivered = jobs
      .filter((j) => j.status === "delivered")
      .sort((a, b) => {
        const ta = a.deliveredAt ? Date.parse(a.deliveredAt) : 0;
        const tb = b.deliveredAt ? Date.parse(b.deliveredAt) : 0;
        return tb - ta;
      })[0];

    function loc(
      id: string | null,
    ): PanelLocationLite | null {
      if (!id) return null;
      return locationsById[id] ?? null;
    }

    if (active) {
      const src = loc(active.sourceLocationId);
      const destLoc = loc(active.destinationLocationId);
      const destLat = destLoc?.lat ?? active.destinationLat;
      const destLng = destLoc?.lng ?? active.destinationLng;
      if (
        src?.lat != null &&
        src?.lng != null &&
        destLat != null &&
        destLng != null
      ) {
        const mid = midpoint(
          { lat: src.lat, lng: src.lng },
          { lat: destLat, lng: destLng },
        );
        return {
          kind: "transport_active",
          source: {
            lat: src.lat,
            lng: src.lng,
            name: src.name,
            address: src.address ?? null,
          },
          destination: {
            lat: destLat,
            lng: destLng,
            name: destLoc?.name ?? "Adres dostawy",
            address: destLoc?.address ?? active.destinationAddress,
          },
          current: {
            lat: mid.lat,
            lng: mid.lng,
            label: STATUS_LABEL[active.status] ?? active.status,
          },
          job: active,
        };
      }
      // Niepełne dane geo — pokaż co się da.
      if (src?.lat != null && src?.lng != null) {
        return {
          kind: "static",
          current: {
            lat: src.lat,
            lng: src.lng,
            label: `Punkt nadania (${STATUS_LABEL[active.status] ?? active.status})`,
          },
          source: {
            lat: src.lat,
            lng: src.lng,
            name: src.name,
            address: src.address ?? null,
          },
          job: active,
        };
      }
    }

    if (delivered) {
      const destLoc = loc(delivered.destinationLocationId);
      const destLat = destLoc?.lat ?? delivered.destinationLat;
      const destLng = destLoc?.lng ?? delivered.destinationLng;
      if (destLat != null && destLng != null) {
        return {
          kind: "transport_delivered",
          destination: {
            lat: destLat,
            lng: destLng,
            name: destLoc?.name ?? "Adres dostawy",
            address: destLoc?.address ?? delivered.destinationAddress,
          },
          current: {
            lat: destLat,
            lng: destLng,
            label: "Dostarczone",
          },
          job: delivered,
        };
      }
    }

    // Fallback — punkt obecnego pobytu (priorytetowo serviceLocation, potem
    // sales location).
    const here = loc(serviceLocationId) ?? loc(locationId);
    if (here?.lat != null && here?.lng != null) {
      return {
        kind: "static",
        current: {
          lat: here.lat,
          lng: here.lng,
          label: here.type === "service" ? "W punkcie serwisowym" : "W punkcie sprzedaży",
        },
        source: {
          lat: here.lat,
          lng: here.lng,
          name: here.name,
          address: here.address ?? null,
        },
      };
    }

    return { kind: "empty" };
  }, [jobs, locationsById, locationId, serviceLocationId]);

  const points = useMemo<Array<[number, number]>>(() => {
    const out: Array<[number, number]> = [];
    if (plan.source) out.push([plan.source.lat, plan.source.lng]);
    if (plan.destination) out.push([plan.destination.lat, plan.destination.lng]);
    if (plan.current && out.length === 0)
      out.push([plan.current.lat, plan.current.lng]);
    return out;
  }, [plan]);

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Ładowanie mapy lokalizacji urządzenia"
        className={`flex items-center justify-center gap-2 rounded-2xl border ${className ?? ""}`}
        style={{
          minHeight: 280,
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Ładowanie mapy…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className={`flex items-start gap-2 rounded-2xl border p-3 ${className ?? ""}`}
        style={{
          background: "rgba(239, 68, 68, 0.08)",
          borderColor: "rgba(239, 68, 68, 0.3)",
          color: "#fca5a5",
        }}
      >
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="text-xs">
          <p className="font-semibold">Nie udało się pobrać lokalizacji</p>
          <p className="opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  if (plan.kind === "empty") {
    return (
      <div
        role="region"
        aria-label="Lokalizacja urządzenia"
        className={`rounded-2xl border p-4 text-center ${className ?? ""}`}
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <MapPin
          className="w-6 h-6 mx-auto mb-2 opacity-40"
          aria-hidden="true"
        />
        <p className="text-sm">Brak danych geolokalizacyjnych.</p>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div
        className={`flex items-center justify-center text-sm rounded-2xl border ${className ?? ""}`}
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          minHeight: 280,
          color: "var(--text-muted)",
        }}
      >
        Ładowanie mapy…
      </div>
    );
  }

  const initialCenter: [number, number] = points[0] ?? [52.2297, 21.0122];

  return (
    <div
      role="region"
      aria-label="Lokalizacja urządzenia na mapie"
      className={`rounded-2xl overflow-hidden border ${className ?? ""}`}
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <MapContainer
        center={initialCenter}
        zoom={13}
        className="w-full"
        style={{ height: "280px", minHeight: 200 }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution={DARK_TILE_ATTRIBUTION}
          url={DARK_TILE_URL}
          keepBuffer={2}
          updateWhenIdle={false}
          maxNativeZoom={19}
        />
        <ResizeFix />
        <FitBounds points={points} />
        {plan.source && (
          <Marker position={[plan.source.lat, plan.source.lng]}>
            <Popup>
              <div style={{ minWidth: 180, fontFamily: "sans-serif" }}>
                <strong style={{ fontSize: 13 }}>{plan.source.name}</strong>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                  Punkt nadania
                </div>
                {plan.source.address && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {plan.source.address}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}
        {plan.destination && (
          <Marker
            position={[plan.destination.lat, plan.destination.lng]}
          >
            <Popup>
              <div style={{ minWidth: 180, fontFamily: "sans-serif" }}>
                <strong style={{ fontSize: 13 }}>
                  {plan.destination.name}
                </strong>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                  Cel dostawy
                </div>
                {plan.destination.address && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {plan.destination.address}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}
        {plan.kind === "transport_active" && plan.source && plan.destination && (
          <Polyline
            positions={[
              [plan.source.lat, plan.source.lng],
              [plan.destination.lat, plan.destination.lng],
            ]}
            pathOptions={{
              color: "#06B6D4",
              weight: 3,
              opacity: 0.8,
              dashArray: "6 6",
            }}
          />
        )}
      </MapContainer>
      {/* Status banner pod mapą (tylko gdy jest aktywny job) */}
      {plan.job && (
        <div
          className="px-3 py-2 flex items-center gap-2 text-xs border-t"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        >
          <Truck
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: "#06B6D4" }}
            aria-hidden="true"
          />
          <span className="font-semibold">
            {STATUS_LABEL[plan.job.status] ?? plan.job.status}
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            · {plan.job.jobNumber}
          </span>
        </div>
      )}
    </div>
  );
}
