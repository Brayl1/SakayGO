import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { createHandler, validateState } from "../worker/handler.mjs";
const base = JSON.parse(
  readFileSync("public/data/catalog.json", "utf8"),
).routes;
const asset = (id) => ({
  body: Buffer.from(readFileSync(`public/data/routes/${id}.json`)).toString(
    "base64",
  ),
  type: "application/json",
});
const handler = createHandler({
  baseRoutes: base,
  assets: {
    "/data/routes/1.json": asset("1"),
    "/index.html": {
      body: Buffer.from("<html>app</html>").toString("base64"),
      type: "text/html",
    },
  },
});
let stored, version, env;
beforeEach(() => {
  stored = null;
  version = 0;
  env = {
    SAKAYGO_ADMIN_EMAIL: "owner@example.test",
    BUCKET: {
      async get(key) {
        if (key.includes("verification")) return null;
        return stored
          ? { json: async () => structuredClone(stored), etag: String(version) }
          : null;
      },
      async put(key, value, options) {
        if (
          (options.onlyIf.etagDoesNotMatch === "*" && stored) ||
          (options.onlyIf.etagMatches &&
            String(version) !== options.onlyIf.etagMatches)
        )
          return null;
        stored = JSON.parse(value);
        version++;
        return { etag: String(version) };
      },
    },
  };
});
const headers = {
  "oai-authenticated-user-id": "owner-id",
  "oai-authenticated-user-email": "owner@example.test",
};
const req = (path, options = {}) =>
  new Request("https://sakay.test" + path, options);
async function draft() {
  const res = await handler.fetch(req("/api/admin/state", { headers }), env);
  return { body: await res.json(), etag: res.headers.get("etag") };
}
const save = (body, etag = "initial", extra = {}) =>
  handler.fetch(
    req("/api/admin/state", {
      method: "PUT",
      headers: {
        ...headers,
        Origin: "https://sakay.test",
        "Content-Type": "application/json",
        "If-Match": etag,
        ...extra,
      },
      body: JSON.stringify(body),
    }),
    env,
  );
describe("Dataset fidelity", () => {
  it("preserves all 76 records and 152 directional geometries", () => {
    expect(base.length).toBe(76);
    expect(base.reduce((n, r) => n + r.directions.length, 0)).toBe(152);
    // Geometry must be exactly the CDO LPTRP source path for the same route.
    const raw = JSON.parse(
      readFileSync("data/source/lptrp/cdo_lptrp_routes.json", "utf8"),
    );
    expect(raw).toHaveLength(76);
    expect(new Set(base.map((r) => r.sourceRouteId)).size).toBe(76);
    for (const r of base) {
      const src = raw.find((s) => s.id === r.sourceRouteId);
      expect(src).toBeDefined();
      const shape = JSON.parse(
        readFileSync(`public/data/routes/${r.id}.json`, "utf8"),
      );
      expect(shape.inbound).toEqual(src.paths.inbound);
      expect(shape.outbound).toEqual(src.paths.outbound);
    }
  });
  it("never creates verified stops or fares", () => {
    for (const r of base) {
      expect(r.status).toBe("approved");
      // Route-plan reference points are allowed, but never as verified stops.
      expect(r.fieldVerification.stops).not.toBe("verified");
      for (const stop of r.stops || []) expect(stop).not.toHaveProperty("verified");
      expect(r.fare).toBeUndefined();
    }
  });
});
describe("Owner authorization and durable state", () => {
  it("denies anonymous and other users", async () => {
    expect((await handler.fetch(req("/api/admin/state"), env)).status).toBe(
      403,
    );
    expect(
      (
        await handler.fetch(
          req("/api/admin/state", {
            headers: {
              ...headers,
              "oai-authenticated-user-email": "other@example.test",
            },
          }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler.fetch(req("/api/admin/state", { headers }), {
          ...env,
          SAKAYGO_ADMIN_EMAIL: undefined,
        })
      ).status,
    ).toBe(403);
  });
  it("rejects cross-origin saves", async () => {
    expect(
      (
        await save((await draft()).body, "initial", {
          Origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
  });
  it("saves settings and route edits across requests", async () => {
    const { body } = await draft();
    body.settings.headline = "Your next sakay";
    body.routes[0].name = "Updated label";
    body.routes[0].reviewNotes = "Private notes";
    expect((await save(body)).status).toBe(200);
    const publicData = await (
      await handler.fetch(req("/api/catalog"), env)
    ).json();
    expect(publicData.settings.headline).toBe("Your next sakay");
    expect(publicData.routes[0].name).toBe("Updated label");
    expect(publicData.routes[0].reviewNotes).toBeUndefined();
    const detail = await (
      await handler.fetch(req("/api/catalog/1"), env)
    ).json();
    expect(detail.reviewNotes).toBeUndefined();
    expect(detail.geometry.inbound.length).toBeGreaterThan(100);
  });
  it("rejects stale revisions without losing newer edits", async () => {
    const { body } = await draft();
    expect((await save(body)).status).toBe(200);
    expect((await save(body)).status).toBe(409);
    expect(version).toBe(1);
  });
  it("archives routes and prevents direct static geometry access", async () => {
    const { body } = await draft();
    body.routes[0].visible = false;
    await save(body);
    expect(
      (await (await handler.fetch(req("/api/catalog"), env)).json()).routes
        .length,
    ).toBe(75);
    expect((await handler.fetch(req("/api/catalog/1"), env)).status).toBe(404);
    expect((await handler.fetch(req("/data/routes/1.json"), env)).status).toBe(
      404,
    );
  });
  it("keeps admin available during maintenance", async () => {
    const { body } = await draft();
    body.settings.maintenance = true;
    await save(body);
    expect(
      (await (await handler.fetch(req("/api/catalog"), env)).json()).routes,
    ).toEqual([]);
    expect(
      (await handler.fetch(req("/api/admin/state", { headers }), env)).status,
    ).toBe(200);
  });
  it("rejects fake verification and invalid geometry", async () => {
    const { body } = await draft();
    body.routes[0].status = "verified";
    expect((await save(body)).status).toBe(400);
    body.routes[0].status = "unverified";
    body.routes[0].geometry = {
      inbound: [
        [124, 8],
        [124, 8],
      ],
      outbound: [
        [124, 8],
        [124, 8],
      ],
    };
    expect((await save(body)).status).toBe(400);
  });
  it("validates new route geometry and duplicate IDs", async () => {
    const { body } = await draft();
    body.routes.push({ ...body.routes[0], id: "custom-new" });
    expect(() => validateState(body, new Set(base.map((r) => r.id)))).toThrow();
    body.routes.at(-1).geometry = {
      inbound: [
        [8.48, 124.65],
        [8.49, 124.65],
      ],
      outbound: [
        [8.49, 124.65],
        [8.48, 124.65],
      ],
    };
    expect((await save(body)).status).toBe(200);
    body.routes.at(-1).id = "1";
    expect(() => validateState(body, new Set(base.map((r) => r.id)))).toThrow();
  });
  it("does not claim success when storage is unavailable", async () => {
    expect((await handler.fetch(req("/api/catalog"), {})).status).toBe(503);
  });
});


it("persists editorial approval without promoting field verification", async () => {
  const { body } = await draft();
  body.routes[0].status = "approved";
  body.routes[0].reviewedAt = "2026-11-25";
  expect((await save(body)).status).toBe(200);
  const response = await handler.fetch(req("/api/catalog"), env);
  const route = (await response.json()).routes.find((r) => r.id === body.routes[0].id);
  expect(route.status).toBe("approved");
  expect(route.fieldVerification.geometry).toBe("unverified");
  expect(route.fieldVerification.fares).toBe("unavailable");
});
