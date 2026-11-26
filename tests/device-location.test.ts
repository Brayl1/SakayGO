import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { requestDeviceLocation } from "../src/deviceLocation";
let success: PositionCallback;
let failure: PositionErrorCallback;
const geo = {
  watchPosition: vi.fn<Geolocation["watchPosition"]>((ok: PositionCallback, fail?: PositionErrorCallback | null) => { success = ok; failure = fail!; return 7; }),
  clearWatch: vi.fn(),
};
const fix = (accuracy: number, timestamp = Date.now()) => ({ coords: { latitude: 8.47, longitude: 124.63, accuracy }, timestamp }) as GeolocationPosition;
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());
it("waits past a coarse first fix and accepts a precise fresh update", () => {
  const ok = vi.fn(), fail = vi.fn();
  requestDeviceLocation(geo, ok, fail);
  success(fix(3000));
  expect(ok).not.toHaveBeenCalled();
  success(fix(15));
  expect(ok).toHaveBeenCalledWith(expect.objectContaining({ coords: expect.objectContaining({ accuracy: 15 }) }));
  expect(geo.watchPosition.mock.calls[0][2]).toMatchObject({ maximumAge: 0, enableHighAccuracy: true });
  expect(geo.clearWatch).toHaveBeenCalledWith(7);
  expect(fail).not.toHaveBeenCalled();
});
it("rejects stale and invalid readings", () => {
  const ok = vi.fn(), fail = vi.fn();
  requestDeviceLocation(geo, ok, fail);
  success(fix(5, Date.now() - 30000));
  success(fix(NaN));
  vi.advanceTimersByTime(15000);
  expect(ok).not.toHaveBeenCalled();
  expect(fail).toHaveBeenCalledWith(expect.stringContaining("No fresh location"));
});
it("does not use a coarse estimate as the origin", () => {
  const ok = vi.fn(), fail = vi.fn();
  requestDeviceLocation(geo, ok, fail);
  success(fix(2500));
  vi.advanceTimersByTime(15000);
  expect(ok).not.toHaveBeenCalled();
  expect(fail).toHaveBeenCalledWith(expect.stringContaining("2500 meters"));
  expect(geo.clearWatch).toHaveBeenCalledWith(7);
});
it("accepts the best recent fix within 100 meters at the deadline", () => {
  const ok = vi.fn();
  requestDeviceLocation(geo, ok, vi.fn());
  vi.advanceTimersByTime(10000);
  success(fix(75));
  success(fix(90));
  vi.advanceTimersByTime(5000);
  expect(ok).toHaveBeenCalledWith(expect.objectContaining({ coords: expect.objectContaining({ accuracy: 75 }) }));
});
it("cancels updates and timeouts when a user changes the selection", () => {
  const ok = vi.fn(), fail = vi.fn();
  const cancel = requestDeviceLocation(geo, ok, fail);
  cancel(); success(fix(5)); vi.advanceTimersByTime(20000);
  expect(ok).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  expect(geo.clearWatch).toHaveBeenCalledWith(7);
});
it("reports denial immediately and clears the watch", () => {
  const fail = vi.fn();
  requestDeviceLocation(geo, vi.fn(), fail);
  failure({ code: 1 } as GeolocationPositionError);
  expect(fail).toHaveBeenCalledWith(expect.stringContaining("permission was denied"));
  expect(geo.clearWatch).toHaveBeenCalledWith(7);
});
it("cleans up even if a provider calls back synchronously", () => {
  const clearWatch = vi.fn(), ok = vi.fn();
  requestDeviceLocation({ watchPosition: cb => { cb(fix(5)); return 12; }, clearWatch }, ok, vi.fn());
  expect(ok).toHaveBeenCalledTimes(1);
  expect(clearWatch).toHaveBeenCalledWith(12);
});
