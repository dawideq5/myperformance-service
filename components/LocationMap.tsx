"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Location } from "@/lib/locations";

// Leaflet + react-leaflet ładowane lazy (client-only). Map components
// SSR-incompatible — używają window/document. dynamic({ssr:false}) =
// rendered tylko po hydracji. Pre-load w useEffect żeby nie blokować
// pierwszego paint.
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
// FlyTo helper — child komponent MapContainer który auto-zoomuje gdy
// lat/lng/zoom zmieniają się. Bez tego MapContainer's `center` prop działa
// tylko initial — po np. wybraniu adresu z autocomplete mapa zostawała
// na starej lokalizacji.
const FlyTo = dynamic(
  () =>
    import("react-leaflet").then((m) => {
      function Comp({
        lat,
        lng,
        zoom,
      }: {
        lat: number;
        lng: number;
        zoom: number;
      }) {
        const map = m.useMap();
        useEffect(() => {
          if (typeof lat === "number" && typeof lng === "number") {
            map.flyTo([lat, lng], zoom, { duration: 0.7 });
          }
        }, [lat, lng, zoom, map]);
        return null;
      }
      return Comp;
    }),
  { ssr: false },
);

// invalidateSize fix — białe kafelki gdy container miał 0px wysokości
// w momencie inicjalizacji (modal, hidden tab, lazy load).
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

// Ciemny motyw — CartoDB Dark Matter (free, OSM-based, retina-ready).
// Atrybucja CartoDB + OSM wymagana licensowo.
const DARK_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const DARK_TILE_ATTRIBUTION =
  '<a href="https://carto.com/attributions">CARTO</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export interface LocationMapProps {
  locations: Location[];
  /** Aktualnie wybrany punkt (highlight + auto-pan). */
  selectedId?: string | null;
  /** Callback po kliknięciu markera. */
  onSelect?: (loc: Location) => void;
  /** Callback drag pin (admin edit mode). null = tryb read-only. */
  onPinDrag?: ((latLng: { lat: number; lng: number }) => void) | null;
  /** Pojedynczy edytowany pin (admin) — drag-enabled. */
  editPin?: { lat: number; lng: number } | null;
  /** Default center jeśli locations puste i editPin null. */
  defaultCenter?: [number, number];
  defaultZoom?: number;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [52.2297, 21.0122]; // Warszawa

export function LocationMap({
  locations,
  selectedId,
  onSelect,
  onPinDrag,
  editPin,
  defaultCenter = DEFAULT_CENTER,
  defaultZoom = 6,
  className,
}: LocationMapProps) {
  const [mounted, setMounted] = useState(false);
  // Leaflet wymaga importu CSS + naprawy default-marker-icon paths (Webpack
  // psuje url() w default skinie). Robimy to raz po mount.
  useEffect(() => {
    void Promise.all([
      import("leaflet/dist/leaflet.css"),
      import("leaflet"),
    ]).then(([, L]) => {
      const Lroot = (L as unknown as { default: typeof import("leaflet") })
        .default ?? L;
      // Fix default icon paths — bez tego markery są niewidoczne (404 na
      // marker-icon.png). Używamy unpkg CDN żeby uniknąć copying assets.
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

  // Center: edit pin → editPin; selected location → jego współrzędne;
  // pierwszy w liście; default Warszawa.
  const center = useMemo<[number, number]>(() => {
    if (editPin) return [editPin.lat, editPin.lng];
    if (selectedId) {
      const sel = locations.find((l) => l.id === selectedId);
      if (sel?.lat != null && sel?.lng != null) return [sel.lat, sel.lng];
    }
    const first = locations.find((l) => l.lat != null && l.lng != null);
    if (first?.lat != null && first?.lng != null) return [first.lat, first.lng];
    return defaultCenter;
  }, [editPin, selectedId, locations, defaultCenter]);

  if (!mounted) {
    return (
      <div
        className={`relative rounded-2xl bg-[var(--bg-surface)] flex items-center justify-center ${className ?? ""}`}
        style={{ minHeight: 300 }}
      >
        <p className="text-sm text-[var(--text-muted)]">Ładowanie mapy…</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl overflow-hidden border border-[var(--border-subtle)] ${className ?? ""}`}
    >
      <MapContainer
        center={center}
        zoom={editPin || selectedId ? 13 : defaultZoom}
        className="w-full h-full"
        style={{ minHeight: 360 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution={DARK_TILE_ATTRIBUTION}
          url={DARK_TILE_URL}
          keepBuffer={4}
          updateWhenIdle={false}
          maxNativeZoom={19}
        />
        <ResizeFix />
        {/* FlyTo: gdy editPin albo selected location się zmieni — animowany
            zoom na nowe współrzędne. Bez tego mapa zostawała na initial. */}
        <FlyTo
          lat={center[0]}
          lng={center[1]}
          zoom={editPin || selectedId ? 15 : defaultZoom}
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
                <div style={{ minWidth: 220, fontFamily: "sans-serif" }}>
                  <strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>
                    {l.name}
                  </strong>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
                    {l.type === "service" ? "Punkt serwisowy" : "Punkt sprzedaży"}
                    {l.warehouseCode ? ` · ${l.warehouseCode}` : ""}
                  </div>
                  {l.address && (
                    <div style={{ fontSize: 12, marginBottom: 6 }}>{l.address}</div>
                  )}
                  {l.photos.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {l.photos.slice(0, 3).map((url, i) => (
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
                  {l.phone && (
                    <div style={{ fontSize: 11 }}>
                      <a href={`tel:${l.phone}`}>{l.phone}</a>
                    </div>
                  )}
                  {l.email && (
                    <div style={{ fontSize: 11 }}>
                      <a href={`mailto:${l.email}`}>{l.email}</a>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        {editPin && onPinDrag && (
          <DraggablePin
            lat={editPin.lat}
            lng={editPin.lng}
            onDrag={onPinDrag}
          />
        )}
      </MapContainer>
    </div>
  );
}

// Draggable marker dla admin edit mode. Eventy onDragend updateuje lat/lng
// w parent state.
function DraggablePin({
  lat,
  lng,
  onDrag,
}: {
  lat: number;
  lng: number;
  onDrag: (latLng: { lat: number; lng: number }) => void;
}) {
  const ref = useRef<{
    setLatLng?: (latlng: [number, number]) => void;
    getLatLng?: () => { lat: number; lng: number };
  } | null>(null);
  return (
    <Marker
      position={[lat, lng]}
      draggable
      ref={(m: typeof ref.current) => {
        ref.current = m;
      }}
      eventHandlers={{
        dragend: () => {
          const ll = ref.current?.getLatLng?.();
          if (ll) onDrag({ lat: ll.lat, lng: ll.lng });
        },
      }}
    >
      <Popup>
        Przeciągnij pin żeby ustawić lokalizację GPS.
        <br />
        <small>
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </small>
      </Popup>
    </Marker>
  );
}
