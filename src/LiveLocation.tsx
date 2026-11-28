import { useCallback, useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import { circle, divIcon, DomEvent, marker, type Circle, type LatLngTuple, type Map as LeafletMap, type Marker } from "leaflet";
import { Navigation, NavigationOff } from "lucide-react";

/**
 * Live "you are here" for the planner map: a pulsing dot that follows the
 * device, an accuracy circle, and a heading cone showing where the person is
 * going (GPS travel direction while moving, compass direction when still).
 *
 * Tap once to start (and follow), drag the map to stop following, tap again to
 * re-centre, and tap while following to turn it off. If location permission was
 * already granted it starts on its own, so it never prompts on page load.
 */
type Status = "off" | "searching" | "on" | "denied" | "unavailable";

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

const MOVING_SPEED = 1; // m/s: above this, GPS heading (travel direction) wins over the compass

function alive(map: LeafletMap) {
  const internal = map as LeafletMap & { _mapPane?: HTMLElement };
  return Boolean(internal._mapPane && map.getContainer().isConnected);
}

const icon = divIcon({
  className: "sg-live-marker",
  html: '<span class="sg-live-heading"></span><span class="sg-live-pulse"></span><span class="sg-live-dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export default function LiveLocation() {
  const map = useMap();
  const [status, setStatus] = useState<Status>("off");
  const [following, setFollowing] = useState(true);
  const [notice, setNotice] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const watch = useRef<number | null>(null);
  const dot = useRef<Marker | null>(null);
  const ring = useRef<Circle | null>(null);
  const followingRef = useRef(true);
  const firstFix = useRef(true);
  const moving = useRef(false);
  const heading = useRef<number | null>(null);
  const frame = useRef(0);

  // Leaflet would treat a click on this button as a map click (and set a
  // trip point while picking), so stop it from reaching the map.
  useEffect(() => {
    if (button.current) DomEvent.disableClickPropagation(button.current);
  }, []);

  const paintHeading = useCallback(() => {
    frame.current = 0;
    const el = dot.current?.getElement();
    if (!el) return;
    const deg = heading.current;
    el.classList.toggle("has-heading", deg !== null);
    if (deg !== null) el.style.setProperty("--live-heading", `${deg}deg`);
  }, []);
  const setHeading = useCallback((deg: number | null) => {
    if (deg !== null && !Number.isFinite(deg)) return;
    const next = deg === null ? null : ((deg % 360) + 360) % 360;
    const prev = heading.current;
    if (prev !== null && next !== null && Math.abs(((next - prev + 540) % 360) - 180) < 2) return;
    heading.current = next;
    if (!frame.current) frame.current = requestAnimationFrame(paintHeading);
  }, [paintHeading]);

  const onOrientation = useCallback((event: Event) => {
    if (moving.current) return;
    const e = event as OrientationEventWithCompass;
    let compass: number | null = null;
    if (typeof e.webkitCompassHeading === "number") compass = e.webkitCompassHeading; // iOS: already clockwise from north
    else if (e.absolute && typeof e.alpha === "number") compass = 360 - e.alpha; // Android absolute alpha is counter-clockwise
    if (compass === null) return;
    const screenAngle = typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : 0;
    setHeading(compass + screenAngle);
  }, [setHeading]);

  const stopOrientation = useCallback(() => {
    window.removeEventListener("deviceorientationabsolute", onOrientation);
    window.removeEventListener("deviceorientation", onOrientation);
  }, [onOrientation]);

  const clearLayers = useCallback(() => {
    if (alive(map)) {
      dot.current?.remove();
      ring.current?.remove();
    }
    dot.current = null;
    ring.current = null;
  }, [map]);

  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    stopOrientation();
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    heading.current = null;
    clearLayers();
  }, [stopOrientation, clearLayers]);

  // On short phone maps the top is covered by floating controls, so keep the
  // followed dot in the open lower part of the map instead of dead centre.
  const viewCentre = useCallback((at: LatLngTuple, zoom: number) => {
    const shift = map.getSize().y < 420 ? map.getSize().y * 0.2 : 0;
    return shift ? map.unproject(map.project(at, zoom).subtract([0, shift]), zoom) : at;
  }, [map]);

  const onPosition = useCallback((position: GeolocationPosition) => {
    if (!alive(map)) return;
    const { latitude, longitude, accuracy, heading: gpsHeading, speed } = position.coords;
    if (![latitude, longitude, accuracy].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
    const at: LatLngTuple = [latitude, longitude];
    setStatus("on");
    setNotice("");
    if (!dot.current) {
      ring.current = circle(at, { radius: accuracy, className: "sg-live-accuracy", interactive: false, weight: 1 }).addTo(map);
      dot.current = marker(at, { icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      paintHeading();
    } else {
      dot.current.setLatLng(at);
      ring.current?.setLatLng(at).setRadius(accuracy);
    }
    moving.current = typeof speed === "number" && speed > MOVING_SPEED;
    if (moving.current && typeof gpsHeading === "number" && Number.isFinite(gpsHeading)) setHeading(gpsHeading);
    if (followingRef.current) {
      const zoom = firstFix.current ? Math.max(map.getZoom(), 16) : map.getZoom();
      if (firstFix.current) map.flyTo(viewCentre(at, zoom), zoom, { duration: 0.8 });
      else map.panTo(viewCentre(at, zoom), { animate: true, duration: 0.5 });
    }
    firstFix.current = false;
  }, [map, paintHeading, setHeading, viewCentre]);

  const onError = useCallback((error: GeolocationPositionError) => {
    if (error.code === error.PERMISSION_DENIED) {
      stop();
      setStatus("denied");
      setNotice("Location is blocked. Allow location for this site in your browser settings to see where you are.");
    } else if (watch.current !== null) {
      // Timeouts and brief signal loss: keep watching, a better fix usually follows.
      setNotice("Looking for a GPS signal…");
    }
  }, [stop]);

  const start = useCallback((fromTap: boolean) => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      setNotice("This device or browser can't share its location.");
      return;
    }
    if (watch.current !== null) return;
    // iOS only allows the compass after a tap, so ask for it from the tap itself.
    const orientation = (window as typeof window & { DeviceOrientationEvent?: OrientationPermission }).DeviceOrientationEvent;
    if (fromTap && typeof orientation?.requestPermission === "function") orientation.requestPermission().catch(() => undefined);
    // Android exposes a true-north event; iOS reports webkitCompassHeading on the plain one.
    const absoluteEvent = "ondeviceorientationabsolute" in window;
    window.addEventListener(absoluteEvent ? "deviceorientationabsolute" : "deviceorientation", onOrientation);
    firstFix.current = true;
    followingRef.current = true;
    setFollowing(true);
    setStatus("searching");
    setNotice("Finding your location…");
    try {
      watch.current = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
    } catch {
      setStatus("unavailable");
      setNotice("Location is unavailable right now.");
    }
  }, [onOrientation, onPosition, onError]);

  // Start by itself only when permission was granted before: no surprise prompt.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions?.query({ name: "geolocation" }).then((result) => {
      if (!cancelled && result.state === "granted") start(false);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [start]);

  // Dragging the map means the person wants to look around: stop following.
  useEffect(() => {
    const release = () => { followingRef.current = false; setFollowing(false); };
    map.on("dragstart", release);
    return () => { map.off("dragstart", release); };
  }, [map]);

  useEffect(() => stop, [stop]);

  // Status messages are hints, not banners: let them fade after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  function onClick() {
    if (status === "on" || status === "searching") {
      if (!following && dot.current) {
        followingRef.current = true;
        setFollowing(true);
        const here = dot.current.getLatLng();
        const zoom = Math.max(map.getZoom(), 16);
        map.flyTo(viewCentre([here.lat, here.lng], zoom), zoom, { duration: 0.6 });
        return;
      }
      stop();
      setStatus("off");
      setNotice("");
      return;
    }
    start(true);
  }

  const active = status === "on" || status === "searching";
  const label =
    status === "searching" ? "Finding your location. Tap to stop."
      : status === "on" && !following ? "Show my live location again"
        : status === "on" ? "Live location on. Tap to turn off."
          : status === "denied" ? "Location blocked. Tap to try again."
            : "Show my live location";
  const blocked = status === "denied" || status === "unavailable";

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`live-location-toggle is-${status}${active && following ? " is-following" : ""}`}
        aria-pressed={active}
        aria-label={label}
        title={label}
        onClick={onClick}
      >
        {blocked ? <NavigationOff size={18} /> : <Navigation size={18} fill={active && following ? "currentColor" : "none"} />}
      </button>
      <span className="live-location-notice" role="status" aria-live="polite">{notice}</span>
    </>
  );
}
