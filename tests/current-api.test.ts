import { afterAll, beforeAll, expect, it } from "vitest";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { app } from "../server/index";
import { createCatalogApi } from "../server/catalog-api.mjs";
let server: Server, base: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
const get = async (path: string) => {
  const response = await fetch(base + path);
  expect(response.status).toBe(200);
  return response.json();
};
it("serves the current catalog contract without reinterpreting demo services", async () => {
  const catalog = await get("/api/catalog");
  const source = JSON.parse(readFileSync("public/data/catalog.json", "utf8"));
  expect(catalog.routes.map((r: {id: string}) => r.id)).toEqual(source.routes.map((r: {id: string}) => r.id));
  expect(catalog.routes).toHaveLength(76);
  expect(catalog.settings).toHaveProperty("maintenance", false);
  expect(catalog.revision).toEqual(expect.any(Number));
  expect(catalog.updatedAt).toEqual(expect.any(String));
  expect(catalog.routes[0]).toMatchObject({ name: source.routes[0].name, roads: source.routes[0].roads, directions: source.routes[0].directions, fieldVerification: source.routes[0].fieldVerification });
  expect(catalog.routes[0]).not.toHaveProperty("reviewNotes");
});
it("preserves independently supplied geometry for different routes and directions", async () => {
  const first = await get("/api/catalog/1"), second = await get("/api/catalog/3");
  expect(first.geometry).toEqual(JSON.parse(readFileSync("public/data/routes/1.json", "utf8")));
  expect(second.geometry).toEqual(JSON.parse(readFileSync("public/data/routes/3.json", "utf8")));
  expect(first.geometry).not.toEqual(second.geometry);
  expect(first.geometry.inbound).not.toEqual(first.geometry.outbound);
  expect((await fetch(base + "/api/catalog/missing")).status).toBe(404);
});
it("never grants Express admin from identity headers or local preview settings", async () => {
  const headers = { "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "local@localhost" };
  expect(await (await fetch(base + "/api/session", { headers })).json()).toEqual({ admin: false, signedIn: false });
  expect((await fetch(base + "/api/admin/state", { headers })).status).toBe(403);
  expect((await fetch(base + "/api/admin/verification", { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
  const api = createCatalogApi({ SAKAYGO_LOCAL_ADMIN: "1", SAKAYGO_ADMIN_EMAIL: "local@localhost" });
  expect(await (await api(new Request("http://localhost/api/session", { headers }))).json()).toEqual({ admin: false, signedIn: false });
});
it("separates approved current policies, reference rates and legacy demo policy", async () => {
  expect((await get("/api/fare-policies/current")).policies).toEqual([]);
  expect((await get("/api/fare-reference")).reference.dataset_id).toBe("sakaygo_fare_reference_2026_09_28");
  expect((await fetch(base + "/api/policies?demo=true")).status).toBe(410);
  expect((await get("/api/route-codes")).research.length).toBeGreaterThan(0);
  expect((await get("/api/test-cases")).length).toBe(3);
});
it("returns real alternatives with synchronized geometry and passenger reference fares", async () => {
  const response = await fetch(base + "/api/trips/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin: [8.449972,124.622735], destination: [8.474176,124.643082], preferences: { passenger: "student" } }) });
  expect(response.status).toBe(200);
  const result = await response.json();
  const a = result.trips.find((t: any) => t.legs[0].routeId === "4"), b = result.trips.find((t: any) => t.legs[0].routeId === "39");
  expect(a.id).not.toBe(b.id);
  expect(a.legs[0].geometry).not.toEqual(b.legs[0].geometry);
  expect(a.rideMeters).not.toEqual(b.rideMeters);
  expect(a.fare).toBeNull();
  expect(a.referenceFare.minimum).toBeLessThan(b.referenceFare.minimum);
  expect(a.legs[0].referenceFares[0].lower.discount).toBe(0.2);
});
it("makes the nonempty legacy dataset's landmark-only semantics explicit", async () => {
  const verified = await get("/api/dataset");
  expect((await fetch(base + "/api/dataset?demo=true")).status).toBe(410);
  expect(verified.source).toBe("bundled_landmarks_only");
  expect(verified.locations.length).toBeGreaterThan(0);
  expect(verified.routes).toEqual([]);
  expect((await get("/api/routes")).routes).toEqual([]);
});
it("surfaces misconfigured storage instead of silently switching datasets", async () => {
  const api = createCatalogApi({ SUPABASE_URL: "https://example.supabase.co" });
  const response = await api(new Request("http://localhost/api/catalog"));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("stack");
});

it("forwards access keys and accepts full admin payloads through Express on its actual origin", async () => {
  const previous = process.env.SAKAYGO_ADMIN_TOKEN;
  process.env.SAKAYGO_ADMIN_TOKEN = "express-admin-regression-key";
  try {
    const headers = { Authorization: "Bearer express-admin-regression-key" };
    expect(await (await fetch(base + "/api/session", { headers })).json()).toEqual({ admin: true, signedIn: true });
    const response = await fetch(base + "/api/admin/state", { headers });
    expect(response.status).toBe(200);
    const draft = await response.json();
    draft.routes.push(draft.routes[0]); // Invalid duplicate: exercises validation without modifying real data.
    const body = JSON.stringify(draft);
    expect(Buffer.byteLength(body)).toBeGreaterThan(16384);
    const saved = await fetch(base + "/api/admin/state", { method: "PUT", headers: { ...headers, Origin: base, "Content-Type": "application/json", "If-Match": response.headers.get("etag")! }, body });
    expect(saved.status).toBe(400);
    expect((await saved.json()).error).toContain("Invalid settings or route data");
  } finally {
    if (previous === undefined) delete process.env.SAKAYGO_ADMIN_TOKEN;
    else process.env.SAKAYGO_ADMIN_TOKEN = previous;
  }
});
