import { useEffect, useState, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import { LocateFixed, Maximize } from "lucide-react";
import type { Journey, Location, Point } from "../shared/model";
import "leaflet/dist/leaflet.css";
function Controls({ points, focus }: { points: Point[]; focus?: Point }) {
  const map = useMap();
  const fit = () =>
    map.fitBounds(points, {
      paddingTopLeft: [35, 45],
      paddingBottomRight: [
        35,
        matchMedia("(max-width: 700px)").matches ? map.getSize().y * 0.59 : 100,
      ],
      maxZoom: 15,
    });
  useEffect(() => {
    if (points.length) fit();
  }, [map, points]);
  useEffect(() => {
    if (focus) {
      const target = matchMedia("(max-width: 700px)").matches
        ? map.unproject(
            map.project(focus, 16).add([0, map.getSize().y * 0.29]),
            16,
          )
        : focus;
      map.flyTo(target, 16, {
        animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
    }
  }, [map, focus]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return (
    <div className="map-tools">
      <button
        aria-label="Fit route"
        title="Fit route"
        onClick={() =>
          points.length ? fit() : map.setView([8.484, 124.65], 14)
        }
      >
        <Maximize size={19} />
      </button>
      <button
        aria-label="Recenter Cagayan de Oro"
        title="Recenter city"
        onClick={() => map.setView([8.484, 124.65], 14)}
      >
        <LocateFixed size={19} />
      </button>
    </div>
  );
}
export default function Map({
  journey,
  places,
  focus,
  user,
}: {
  journey?: Journey;
  places: Location[];
  focus?: Point;
  user?: Point;
}) {
  const [failed, setFailed] = useState(false);
  const points = useMemo(
    () =>
      journey
        ? journey.rides.flatMap((r) => r.points)
        : places.map((l) => l.point),
    [journey, places],
  );
  return (
    <div className="map-wrap">
      <MapContainer center={[8.484, 124.65]} zoom={14} zoomControl={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setFailed(true) }}
        />
        {journey?.rides.map((ride, i) => (
          <Polyline
            key={ride.route.id}
            positions={ride.points}
            pathOptions={{
              color: i ? "#587049" : "#587049",
              weight: 6,
              dashArray: i ? "10 7" : undefined,
            }}
          />
        ))}
        {places.map((l) => (
          <CircleMarker
            key={l.id}
            center={l.point}
            radius={
              journey?.rides.some((r) => r.from.id === l.id || r.to.id === l.id)
                ? 9
                : 5
            }
            pathOptions={{
              color: "#fff",
              weight: 3,
              fillColor:
                journey?.rides[0].from.id === l.id ? "#3F5A33" : "#587049",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <strong>{l.name}</strong>
              <p>Approximate landmark. Not a verified jeepney stop.</p>
              {journey?.rides
                .filter((r) => r.from.id === l.id)
                .map((r) => (
                  <p key={r.route.id}>
                    Demo boarding: {r.route.signboard}
                    <br />
                    {r.route.direction}
                  </p>
                ))}
            </Popup>
          </CircleMarker>
        ))}
        {user && (
          <CircleMarker
            center={user}
            radius={10}
            pathOptions={{ color: "#587049" }}
          >
            <Popup>Your location (not saved)</Popup>
          </CircleMarker>
        )}
        <Controls points={points} focus={focus} />
      </MapContainer>
      <div className="map-label">
        <span className="live-dot" /> Cagayan de Oro <span>Philippines</span>
      </div>
      <div className="map-legend">
        <span>
          <i /> Demo ride
        </span>
        <span>
          <i className="transfer" /> Transfer ride
        </span>
        <span>Landmarks ≠ verified stops</span>
      </div>
      {failed && (
        <div className="tile-error" role="status">
          Some map tiles could not load. Route details remain available in the
          panel.
        </div>
      )}
    </div>
  );
}


