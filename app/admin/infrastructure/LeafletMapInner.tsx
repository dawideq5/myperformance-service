"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";

interface MarkerPoint {
  ip: string;
  lat: number;
  lng: number;
  country: string | null;
  city: string | null;
  events: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
}

interface LeafletMapInnerProps {
  markers: MarkerPoint[];
}

const SEVERITY_COLOR: Record<MarkerPoint["severity"], string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#facc15",
  info:     "#22c55e",
};

export default function LeafletMapInner({ markers }: LeafletMapInnerProps) {
  return (
    <MapContainer
      center={[50, 15]}
      zoom={4}
      style={{ height: "400px", width: "100%", borderRadius: "0.5rem" }}
      className="z-0"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      {markers.map((m) => {
        const radius = Math.min(14, 4 + Math.log10(m.events + 1) * 3);
        return (
          <CircleMarker
            key={m.ip}
            center={[m.lat, m.lng]}
            radius={radius}
            pathOptions={{
              color: SEVERITY_COLOR[m.severity],
              fillColor: SEVERITY_COLOR[m.severity],
              fillOpacity: 0.75,
              weight: 1,
            }}
          >
            <Popup>
              <div style={{ fontSize: "12px", lineHeight: "1.5" }}>
                <strong style={{ fontFamily: "monospace" }}>{m.ip}</strong>
                <br />
                {m.city && <>{m.city}, </>}
                {m.country ?? "—"}
                <br />
                Zdarzenia: <strong>{m.events}</strong>
                <br />
                Severity:{" "}
                <span style={{ color: SEVERITY_COLOR[m.severity], fontWeight: 600 }}>
                  {m.severity}
                </span>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
