import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCatalogApi } from "../server/catalog-api.mjs";
const directories = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
const token = "test-only-administrator-access-key";
const request = (path, options = {}) =>
  new Request(`http://localhost${path}`, options);
const headers = { Authorization: `Bearer ${token}` };
it("authenticates only the configured access key", async () => {
  const api = createCatalogApi({ SAKAYGO_ADMIN_TOKEN: token });
  expect(
    await (await api(request("/api/session", { headers }))).json(),
  ).toEqual({ admin: true, signedIn: true });
  for (const authorization of ["", "Bearer wrong", token]) {
    expect(
      (await api(request("/api/admin/state", { headers: { authorization } })))
        .status,
    ).toBe(403);
  }
  expect(
    (await createCatalogApi({})(request("/api/admin/state", { headers })))
      .status,
  ).toBe(403);
});
it("persists added routes, edits and verification across server instances; rejects conflicts and cross-origin writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sakaygo-admin-test-"));
  directories.push(directory);
  const root = pathToFileURL(directory + "/");
  const env = { SAKAYGO_ADMIN_TOKEN: token };
  const api = createCatalogApi(env, root);
  const response = await api(request("/api/admin/state", { headers }));
  const draft = await response.json();
  draft.settings.announcement = "Admin regression test";
  draft.routes.push({
    ...draft.routes[0],
    id: "custom-test",
    name: "Test route",
    geometry: {
      inbound: [
        [8.48, 124.65],
        [8.49, 124.65],
      ],
      outbound: [
        [8.49, 124.65],
        [8.48, 124.65],
      ],
    },
  });
  const save = (origin, etag) =>
    api(
      request("/api/admin/state", {
        method: "PUT",
        headers: {
          ...headers,
          Origin: origin,
          "Content-Type": "application/json",
          "If-Match": etag,
        },
        body: JSON.stringify(draft),
      }),
    );
  expect(
    (await save("http://evil.example", response.headers.get("etag"))).status,
  ).toBe(403);
  const saved = await save("http://localhost", response.headers.get("etag"));
  expect(saved.status).toBe(200);
  expect(
    (await save("http://localhost", response.headers.get("etag"))).status,
  ).toBe(409);
  const restarted = createCatalogApi(env, root);
  const catalog = await (await restarted(request("/api/catalog"))).json();
  expect(catalog.settings.announcement).toBe("Admin regression test");
  expect(catalog.routes.at(-1).id).toBe("custom-test");
  const detail = await (
    await restarted(request("/api/catalog/custom-test"))
  ).json();
  expect(detail.geometry).toEqual(draft.routes.at(-1).geometry);
  const verification = await restarted(
    request("/api/admin/verification", { headers }),
  );
  const verified = await restarted(
    request("/api/admin/verification", {
      method: "PUT",
      headers: {
        ...headers,
        Origin: "http://localhost",
        "Content-Type": "application/json",
        "If-Match": verification.headers.get("etag"),
      },
      body: JSON.stringify({
        crosswalks: [],
        farePolicies: [],
        vehicleClassifications: [],
        approve: false,
      }),
    }),
  );
  expect(verified.status).toBe(200);
});
it("does not report ephemeral Vercel writes as persistent saves", async () => {
  const api = createCatalogApi({ SAKAYGO_ADMIN_TOKEN: token, VERCEL: "1" });
  expect(
    (
      await api(
        request("/api/admin/state", { method: "PUT", headers, body: "{}" }),
      )
    ).status,
  ).toBe(503);
});
