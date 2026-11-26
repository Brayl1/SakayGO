import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHandler } from "../worker/handler.mjs";

// Reuse the current API's contracts, geometry and fare engine inside Express.
// The stop-ID prototype remains separate; it is not a CatalogState dataset.
const moduleRoot = new URL("../", import.meta.url);
const projectRoot = existsSync(new URL("public/data/catalog.json", moduleRoot))
  ? moduleRoot : new URL("../", moduleRoot);
export function createCatalogApi(env = process.env) {
  let handler;
  async function loadHandler() {
    const read = async (file) => JSON.parse(await fs.readFile(new URL(file, projectRoot), "utf8"));
    const catalog = await read("public/data/catalog.json");
    const assets = {};
    await Promise.all([
      "geometric-test-cases.json",
      ...catalog.routes.map((r) => `routes/${r.id}.json`),
    ].map(async (file) => {
      assets[`/data/${file}`] = {
        type: "application/json",
        body: (await fs.readFile(new URL(`public/data/${file}`, projectRoot))).toString("base64"),
      };
    }));
    return createHandler({
      baseRoutes: catalog.routes,
      assets,
      researchCodes: await read("public/data/code-research.json"),
      fareReference: await read("public/data/fare-reference.json"),
    });
  }
  const localStore = {
    async get(key) {
      const file = new URL(`.local-admin/${createHash("sha256").update(key).digest("hex")}.json`, projectRoot);
      try {
        const text = await fs.readFile(file, "utf8");
        return { etag: createHash("sha256").update(text).digest("hex"), json: async () => JSON.parse(text) };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async put() { throw new Error("An authenticated admin transport is required"); },
  };
  return async (request) => {
    const path = new URL(request.url).pathname;
    // Express is not behind Sites' trusted identity gateway and has no login
    // middleware. Never trust identity headers or turn a local preview flag into
    // an authenticated Express session.
    if (path === "/api/session")
      return Response.json({ admin: false, signedIn: false }, { headers: { "Cache-Control": "no-store" } });
    if (path.startsWith("/api/admin/"))
      return Response.json({ error: "Owner authentication is not configured on this Express server." }, { status: 403 });
    const headers = new Headers(request.headers);
    headers.delete("oai-authenticated-user-email");
    headers.delete("oai-authenticated-user-id");
    handler ??= loadHandler().catch((error) => { handler = undefined; throw error; });
    return (await handler).fetch(new Request(request, { headers }), {
      BUCKET: localStore,
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY,
      GEOSEARCH_URL: env.GEOSEARCH_URL,
      GEOSEARCH_ATTRIBUTION: env.GEOSEARCH_ATTRIBUTION,
      WALK_ROUTER_URL: env.WALK_ROUTER_URL,
      WALK_ROUTER_TOKEN: env.WALK_ROUTER_TOKEN,
    });
  };
}
