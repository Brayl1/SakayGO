import { useEffect, useLayoutEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { divIcon, marker, polyline, type Layer, type Map as LeafletMap } from "leaflet";
import { useReducedMotion } from "motion/react";
import { Maximize, RotateCcw } from "lucide-react";
import type { Place, Trip } from "../shared/trip-types";
import type { Point } from "../shared/model";
import { measurePath, positionOnPath } from "./routeAnimation";
import LiveLocation from "./LiveLocation";
import "leaflet/dist/leaflet.css";

// react-leaflet removes the map before child effect cleanups run, so cleanup
// code must not touch a removed map: map.stop() on it throws "_leaflet_pos".
function mapAlive(map: LeafletMap) {
  const internal = map as LeafletMap & { _mapPane?: HTMLElement };
  return Boolean(internal._mapPane && map.getContainer().isConnected);
}
type Props = {
  origin: Place | null;
  destination: Place | null;
  trip?: Trip;
  picking: string | null;
  onPoint: (p: Point) => void;
  focus?: Point;
  replay: number;
  onReplay: () => void;
};
const jeepneySvg =
  '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M9 7Q16 3 23 7V24H9Z" fill="white" stroke="#587049" stroke-width="2"/><path d="M11 9H21V15H11Z" fill="#587049"/><path d="M11 20H21M11 25V28M21 25V28" stroke="#587049" stroke-width="3"/><circle cx="12" cy="18" r="1" fill="#587049"/><circle cx="20" cy="18" r="1" fill="#587049"/></svg>';
function CameraAndRide({
  trip,
  origin,
  destination,
  replay,
  onPhase,
}: Props & { onPhase: (s: string) => void }) {
  const map = useMap(),
    reduced = useReducedMotion();
  useEffect(() => {
    let frame = 0,
      timer: ReturnType<typeof setTimeout> | undefined,
      cancelled = false,
      started = false;
    const layers: Layer[] = [];
    const points: Point[] = trip
      ? [
          ...trip.legs.flatMap((l) => l.geometry),
          ...trip.walks.flatMap((w) => w.geometry),
        ]
      : ([origin?.point, destination?.point].filter(Boolean) as Point[]);
    map.stop();
    const draw = () => {
      if (cancelled || started || !trip) return;
      started = true;
      clearTimeout(timer);
      map.off("moveend", draw);
      const paths = trip.legs.map((l) => measurePath(l.geometry));
      const total = paths.reduce((sum, p) => sum + p.total, 0);
      const lines = paths.map((p, i) => {
        const line = polyline(reduced ? p.points : [p.points[0]], {
          color: i ? "#3F5A33" : "#587049",
          weight: 6,
          opacity: 1,
          className: "animated-ride",
        }).addTo(map);
        const pathElement = line.getElement();
        if (pathElement) {
          pathElement.setAttribute("data-itinerary-id", trip.id);
          pathElement.setAttribute("data-route-id", trip.legs[i].routeId);
          pathElement.setAttribute("data-direction", trip.legs[i].direction);
        }
        layers.push(line);
        return line;
      });
      const vehicle = marker(paths[0].points[0], {
        icon: divIcon({
          className: "jeepney-preview-marker",
          html: '<div class="jeepney-bearing">' + jeepneySvg + "</div>",
          iconSize: [38, 38],
          iconAnchor: [19, 42],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1200,
        title: "Jeepney trip preview — not live GPS",
      }).addTo(map);
      layers.push(vehicle);
      const update = (fraction: number) => {
        let remaining = total * fraction,
          active = 0,
          local = 0;
        for (let i = 0; i < paths.length; i++) {
          const progress = paths[i].total
            ? Math.min(1, Math.max(0, remaining / paths[i].total))
            : 1;
          lines[i].setLatLngs(positionOnPath(paths[i], progress).visible);
          if (remaining >= 0) {
            active = i;
            local = progress;
          }
          remaining -= paths[i].total;
        }
        const pos = positionOnPath(paths[active], local);
        vehicle.setLatLng(pos.point);
        const element = vehicle.getElement();
        if (element) {
          element.dataset.progress = String(fraction);
          element.dataset.route = trip.id;
          element.dataset.latitude = String(pos.point[0]);
          element.dataset.longitude = String(pos.point[1]);
          const inner = element.querySelector<HTMLElement>(".jeepney-bearing");
          if (inner) inner.style.transform = `rotate(${pos.bearing}deg)`;
        }
      };
      if (reduced) {
        update(1);
        onPhase("Route preview ready");
        return;
      }
      onPhase("Playing route preview");
      let start: number | undefined;
      const tick = (time: number) => {
        if (cancelled) return;
        start ??= time;
        const t = Math.min(1, (time - start) / 1800);
        update(t);
        if (t < 1) frame = requestAnimationFrame(tick);
        else onPhase("Route preview complete");
      };
      frame = requestAnimationFrame(tick);
    };
    if (points.length) {
      if (trip && !reduced) {
        onPhase("Framing your route");
        map.once("moveend", draw);
        map.flyToBounds(points, {
          paddingTopLeft: [42, 60],
          paddingBottomRight: [85, 60],
          maxZoom: 16,
          duration: 0.8,
        });
        timer = setTimeout(draw, 1000);
      } else {
        map.fitBounds(points, {
          paddingTopLeft: [42, 60],
          paddingBottomRight: [85, 60],
          maxZoom: 16,
          animate: false,
        });
        draw();
      }
    } else onPhase("Choose two places to preview your trip");
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      map.off("moveend", draw);
      if (!mapAlive(map)) return;
      map.stop();
      layers.forEach((l) => map.removeLayer(l));
    };
  }, [map, trip, origin, destination, replay, reduced, onPhase]);
  return null;
}
function Controls(props: Props) {
  const map = useMap(),
    reduced = useReducedMotion();
  useMapEvents({
    click: (e) => {
      if (props.picking) props.onPoint([e.latlng.lat, e.latlng.lng]);
    },
  });
  useEffect(() => {
    if (props.focus)
      map.flyTo(props.focus, 17, { animate: !reduced, duration: 0.6 });
  }, [props.focus, map, reduced]);
  // Same teardown as CatalogMap: stop any fly/zoom while the map still exists
  // (layout cleanups run before react-leaflet's passive map.remove()) and clear
  // Leaflet 1.9.4's leftover zoom-animation flag so its timer is a no-op.
  useLayoutEffect(() => () => {
    if (mapAlive(map)) map.stop();
    (map as typeof map & { _animatingZoom?: boolean })._animatingZoom = false;
  }, [map]);
  useEffect(() => {
    const o = new ResizeObserver(() => { if (mapAlive(map)) map.invalidateSize({ pan: false }); });
    o.observe(map.getContainer());
    return () => o.disconnect();
  }, [map]);
  const fit = () => {
    const p: Point[] = props.trip
      ? [
          ...props.trip.legs.flatMap((l) => l.geometry),
          ...props.trip.walks.flatMap((w) => w.geometry),
        ]
      : ([props.origin?.point, props.destination?.point].filter(
          Boolean,
        ) as Point[]);
    if (p.length)
      map.flyToBounds(p, {
        paddingTopLeft: [42, 60],
        paddingBottomRight: [85, 60],
        maxZoom: 16,
        animate: !reduced,
        duration: 0.7,
      });
    else map.flyTo([8.48, 124.65], 13, { animate: !reduced });
  };
  return (
    <div className="map-tools">
      <button onClick={fit} aria-label="Fit trip to map">
        <Maximize size={18} />
      </button>
      <LiveLocation />
      {props.trip && (
        <button
          onClick={props.onReplay}
          aria-label="Replay route animation on map"
        >
          <RotateCcw size={18} />
        </button>
      )}
    </div>
  );
}
export default function TripMap(props: Props) {
  const [phase, setPhase] = useState("Choose two places to preview your trip"),
    [tileError, setTileError] = useState(false),
    [tileVersion, setTileVersion] = useState(0);
  const markers: {
    point: Point;
    label: string;
    symbol: string;
    color: string;
  }[] = [];
  if (props.origin)
    markers.push({
      point: props.origin.point,
      label: "Origin: " + props.origin.label,
      symbol: "A",
      color: "green",
    });
  if (props.destination)
    markers.push({
      point: props.destination.point,
      label: "Destination: " + props.destination.label,
      symbol: "B",
      color: "red",
    });
  props.trip?.legs.forEach((l, i) => {
    markers.push(
      {
        point: l.board,
        label: `Leg ${i + 1}: approximate boarding area, confirm a safe stop with driver`,
        symbol: String(i * 2 + 1),
        color: i ? "green" : "red",
      },
      {
        point: l.alight,
        label: `Leg ${i + 1}: approximate drop-off area, confirm with driver`,
        symbol: String(i * 2 + 2),
        color: i < props.trip!.legs.length - 1 ? "green" : "red",
      },
    );
  });
  return (
    <div
      className="trip-map"
      data-animation-state={phase}
      data-itinerary-id={props.trip?.id || ""}
    >
      <MapContainer center={[8.48, 124.65]} zoom={13}>
        <TileLayer
          key={tileVersion}
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />
        {props.trip?.walks.map((w, i) => (
          <Polyline
            key={(props.trip?.id || "") + "walk" + i}
            positions={w.geometry}
            pathOptions={{ color: "#587049", weight: 3, dashArray: "6 8" }}
          />
        ))}
        {markers.map((m, i) => (
          <Marker
            key={`${props.trip?.id || "places"}:${i}:${m.point.join(",")}`}
            position={m.point}
            title={m.label}
            alt={m.label}
            icon={divIcon({
              className: `trip-marker marker-${m.color}`,
              html: `<span>${m.symbol}</span>`,
              iconSize: [30, 30],
              iconAnchor: [15, 15],
            })}
          >
            <Popup>
              {m.label}
              <br />
              {m.point.map((n) => n.toFixed(6)).join(", ")}
            </Popup>
          </Marker>
        ))}
        <CameraAndRide
          key={props.trip?.id || "places"}
          {...props}
          onPhase={setPhase}
        />
        <Controls {...props} />
      </MapContainer>
      <div className="map-label" role="status">
        {props.picking
          ? `Tap map to set ${props.picking}`
          : props.trip
            ? phase
            : "Your city. Your next sakay."}
      </div>
      {tileError && (
        <div className="map-load-error" role="alert">
          Some map tiles could not load. Your route details are still available.
          <button
            onClick={() => {
              setTileError(false);
              setTileVersion((v) => v + 1);
            }}
          >
            Retry map
          </button>
        </div>
      )}
      <div className="catalog-legend">
        <span>
          <i />
          Jeepney
        </span>
        <span>
          <i className="walk-line" />
          Approx. walk
        </span>
        {(props.trip?.transfers || 0) > 0 && (
          <span>
            <i className="transfer-line" />
            Transfer ride
          </span>
        )}
        <b>Preview · not live GPS</b>
      </div>
    </div>
  );
}





