// Wait for a fresh, useful fix instead of accepting an initial network estimate.
export function requestDeviceLocation(
  geo: Pick<Geolocation, "watchPosition" | "clearWatch">,
  onSuccess: (position: GeolocationPosition) => void,
  onError: (message: string) => void,
): () => void {
  let stopped = false;
  let watch: number | undefined;
  let best: GeolocationPosition | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    if (watch !== undefined) geo.clearWatch(watch);
  };
  const fail = (message: string) => { stop(); onError(message); };
  const accept = (position: GeolocationPosition) => { stop(); onSuccess(position); };
  const timer = setTimeout(() => {
    if (stopped) return;
    if (best && Date.now() - best.timestamp <= 10000 && best.coords.accuracy <= 100) {
      accept(best);
    } else {
      fail(best
        ? `Your device could only locate you within about ${Math.ceil(best.coords.accuracy)} meters. That is too imprecise for a starting point. Enable precise location, try again outdoors, or choose your position on the map.`
        : "No fresh location was available. Enable device location and try again, or choose your starting point on the map.");
    }
  }, 15000);
  try {
    watch = geo.watchPosition(position => {
      if (stopped) return;
      const { latitude, longitude, accuracy } = position.coords;
      if (![latitude, longitude, accuracy, position.timestamp].every(Number.isFinite) ||
          Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0 ||
          Date.now() - position.timestamp > 10000 || position.timestamp > Date.now() + 1000) return;
      if (!best || Date.now() - best.timestamp > 10000 || accuracy < best.coords.accuracy) best = position;
      if (accuracy <= 50) accept(position);
    }, error => {
      if (stopped) return;
      if (error.code === 1) fail("Location permission was denied. You can still search for your starting place or choose it on the map.");
      // Transient unavailable/timeout errors may be followed by a better fix.
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    // Also clean up providers that deliver a result synchronously.
    if (stopped) geo.clearWatch(watch);
  } catch {
    fail("Location is unavailable. Enable location access or choose your starting point on the map.");
  }
  return stop;
}
