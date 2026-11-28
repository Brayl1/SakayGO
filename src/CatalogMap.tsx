import { useEffect, useLayoutEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { LocateFixed, Maximize } from "lucide-react";
import { useState } from "react";
import type { Point } from "../shared/model";
import type { RouteStop } from "../shared/catalog";
import "leaflet/dist/leaflet.css";
function Controls({
  points,
  alternate,
}: {
  points: Point[];
  alternate: Point[];
}) {
  const map = useMap();
  useLayoutEffect(() => {
    const stop = () => {
      map.stop();
      // Leaflet 1.9.4 leaves a 250 ms CSS zoom completion timer behind on
      // remove(). Its callback checks this flag before touching removed panes.
      // Clear it before React Leaflet's passive map teardown, retaining normal
      // zoom animation while the map is mounted.
      (map as typeof map & { _animatingZoom?: boolean })._animatingZoom = false;
    };
    return stop;
  }, [map]);
  const fit = () => {
    if (points.length)
      map.fitBounds(points, { padding: [38, 45], maxZoom: 16 });
    else map.setView([8.48, 124.65], 12);
  };
  useEffect(fit, [map, points]);
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (map.getContainer().isConnected) map.invalidateSize(); });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return (
    <div className="map-tools">
      <button aria-label="Fit selected alignment" onClick={fit}>
        <Maximize size={18} />
      </button>
      <button
        aria-label="Show both directions"
        onClick={() =>
          points.length &&
          map.fitBounds([...points, ...alternate], {
            padding: [35, 35],
            maxZoom: 16,
          })
        }
      >
        <LocateFixed size={18} />
      </button>
    </div>
  );
}
export default function CatalogMap({
  points,
  alternate,
  name,
  direction,
  stops = [],
}: {
  points: Point[];
  alternate: Point[];
  name: string;
  direction: string;
  stops?: RouteStop[];
}) {
  const [error, setError] = useState(false);
  return (
    <div className="catalog-map">
      <MapContainer center={[8.48, 124.65]} zoom={12}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          eventHandlers={{ tileerror: () => setError(true) }}
        />
        {alternate.length > 0 && (
          <Polyline
            positions={alternate}
            pathOptions={{
              color: "#56634B",
              weight: 4,
              dashArray: "5 8",
              opacity: 0.65,
            }}
          />
        )}
        {points.length > 0 && (
          <>
            <Polyline
              positions={points}
              pathOptions={{ color: "#fff", weight: 9, opacity: 0.85 }}
            />
            <Polyline
              positions={points}
              pathOptions={{ color: "#587049", weight: 5 }}
            />
            {[points[0], points.at(-1)!].map((p, i) => (
              <CircleMarker
                center={p}
                radius={8}
                pathOptions={{
                  color: "#fff",
                  weight: 3,
                  fillColor: i ? "#46583A" : "#587049",
                  fillOpacity: 1,
                }}
                key={i}
              >
                <Popup>
                  <strong>
                    {i ? "End" : "Start"} of recorded {direction} geometry
                  </strong>
                  <p>{name}</p>
                  <p>
                    This is a shape endpoint, not a verified boarding or
                    drop-off point.
                  </p>
                </Popup>
              </CircleMarker>
            ))}
          </>
        )}
        {stops.map((stop, i) => (
          <CircleMarker
            key={`stop-${i}`}
            center={[stop.lat, stop.lng]}
            radius={6}
            pathOptions={{ color: "#fff", weight: 2, fillColor: "#1F4D34", fillOpacity: 1 }}
          >
            <Popup>
              <strong>{stop.name}</strong>
              <p>Route plan reference point ({stop.type}), not a designated stop.</p>
            </Popup>
          </CircleMarker>
        ))}
        <Controls points={points} alternate={alternate} />
      </MapContainer>
      <div className="map-label">
        <span className="live-dot" />
        Cagayan de Oro<span>Route explorer</span>
      </div>
      <div className="catalog-legend">
        <span>
          <i />
          Selected direction
        </span>
        <span>
          <i className="muted-line" />
          Other direction
        </span>
        <b>Unverified alignment</b>
      </div>
      {error && (
        <div className="tile-error" role="status">
          Map tiles could not load. Route names and details remain available.
        </div>
      )}
    </div>
  );
}


