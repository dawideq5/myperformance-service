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
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false },
);

export interface PanelLocation {
  id: string;
  name: string;
  warehouseCode: string | null;
  type: "sales" | "service";
  address: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  photos: string[];
}

export function PanelLocationMap({
  locations,
  selectedId,
  onSelect,
  className,
}: {
  locations: PanelLocation[];
  selectedId?: string | null;
  onSelect?: (loc: PanelLocation) => void;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

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

  const center = useMemo<[number, number]>(() => {
    if (selectedId) {
      const sel = locations.find((l) => l.id === selectedId);
      if (sel?.lat != null && sel?.lng != null) return [sel.lat, sel.lng];
    }
    const first = locations.find((l) => l.lat != null && l.lng != null);
    if (first?.lat != null && first?.lng != null) return [first.lat, first.lng];
    return [52.2297, 21.0122];
  }, [selectedId, locations]);

  if (!mounted) {
    return (
      <div
        className={`flex items-center justify-center text-sm rounded-2xl ${className ?? ""}`}
        style={{ background: "var(--bg-surface)", minHeight: 360, color: "var(--text-muted)" }}
      >
        Ładowanie mapy…
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl overflow-hidden border ${className ?? ""}`}
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <MapContainer
        center={center}
        zoom={selectedId ? 13 : 6}
        className="w-full h-full"
        style={{ minHeight: 360 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {locations
          .filter((l) => l.lat != null && l.lng != null)
          .map((l) => (
            <Marker
              key={l.id}
              position={[l.lat as number, l.lng as number]}
              eventHandlers={{
                click: () => onSelect?.(l),
              }}
            >
              <Popup>
                <div style={{ minWidth: 200, fontFamily: "sans-serif" }}>
                  <strong style={{ fontSize: 14 }}>{l.name}</strong>
                  {l.warehouseCode && (
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                      {l.warehouseCode} · {l.type === "service" ? "Serwis" : "Sprzedaż"}
                    </div>
                  )}
                  {l.address && (
                    <div style={{ fontSize: 12, marginTop: 6 }}>{l.address}</div>
                  )}
                  {l.photos.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      {l.photos.slice(0, 3).map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={url}
                          alt=""
                          style={{
                            width: 56,
                            height: 56,
                            objectFit: "cover",
                            borderRadius: 4,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {onSelect && (
                    <button
                      type="button"
                      onClick={() => onSelect(l)}
                      style={{
                        marginTop: 8,
                        padding: "6px 12px",
                        borderRadius: 6,
                        background: "#0c0c0e",
                        color: "#fff",
                        border: "none",
                        fontSize: 12,
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      Wybierz ten punkt →
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
