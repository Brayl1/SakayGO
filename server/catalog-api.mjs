import fs from "node:fs/promises";
import { createKaSakay } from "./kasakay.mjs";
import { existsSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { createHandler } from "../worker/handler.mjs";

// Reuse the current API's contracts, geometry and fare engine inside Express.
// The stop-ID prototype remains separate; it is not a CatalogState dataset.
const moduleRoot = new URL("../", import.meta.url);
const projectRoot = existsSync(new URL("public/data/catalog.json", moduleRoot))
  ? moduleRoot
  : new URL("../", moduleRoot);
export function createCatalogApi(
  env = process.env,
  storageRoot = new URL(".local-admin/", projectRoot),
) {
  let handler;
  let queue = Promise.resolve();
  async function loadHandler() {
    const read = async (file) =>
      JSON.parse(await fs.readFile(new URL(file, projectRoot), "utf8"));
    const catalog = await read("public/data/catalog.json");
    const assets = {};
    await Promise.all(
      [
        "geometric-test-cases.json",
        ...catalog.routes.map((r) => `routes/${r.id}.json`),
      ].map(async (file) => {
        assets[`/data/${file}`] = {
          type: "application/json",
          body: (
            await fs.readFile(new URL(`public/data/${file}`, projectRoot))
          ).toString("base64"),
        };
      }),
    );
    return createHandler({
      baseRoutes: catalog.routes,
      assets,
      researchCodes: await read("public/data/code-research.json"),
      fareReference: await read("public/data/fare-reference.json"),
    });
  }
  const localStore = {
    async get(key) {
      const file = new URL(
        `${createHash("sha256").update(key).digest("hex")}.json`,
        storageRoot,
      );
      try {
        const text = await fs.readFile(file, "utf8");
        return {
          etag: createHash("sha256").update(text).digest("hex"),
          json: async () => JSON.parse(text),
        };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    put(key, value, options) {
      const task = queue.then(async () => {
        const current = await this.get(key);
        if (
          (options.onlyIf.etagDoesNotMatch === "*" && current) ||
          (options.onlyIf.etagMatches &&
            current?.etag !== options.onlyIf.etagMatches)
        )
          return null;
        const root = storageRoot;
        await fs.mkdir(root, { recursive: true });
        const name = createHash("sha256").update(key).digest("hex");
        await fs.writeFile(new URL(`${name}.tmp`, root), value);
        await fs.rename(
          new URL(`${name}.tmp`, root),
          new URL(`${name}.json`, root),
        );
        return { etag: createHash("sha256").update(value).digest("hex") };
      });
      queue = task.catch(() => {});
      return task;
    },
  };
  const assistant = createKaSakay({ env, api: (request) => dispatch(request) });
  const dispatch = async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/api/kasakay") return assistant(request);
    // Only a configured server secret grants access. Client identity headers are never trusted.
    const supplied = request.headers.get("authorization") || "";
    const expected = env.SAKAYGO_ADMIN_TOKEN
      ? `Bearer ${env.SAKAYGO_ADMIN_TOKEN}`
      : "";
    const authenticated =
      !!expected &&
      timingSafeEqual(
        createHash("sha256").update(supplied).digest(),
        createHash("sha256").update(expected).digest(),
      );
    if (path === "/api/session")
      return Response.json(
        { admin: authenticated, signedIn: authenticated },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (path.startsWith("/api/admin/") && !authenticated)
      return Response.json(
        {
          error: expected
            ? "Enter your administrator access key."
            : "Set SAKAYGO_ADMIN_TOKEN on the server to enable administrator access.",
          auth: "access-key",
        },
        { status: 403 },
      );
    if (
      authenticated &&
      path.startsWith("/api/admin/") &&
      request.method === "PUT" &&
      env.VERCEL &&
      !(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY)
    )
      return Response.json(
        { error: "Configure persistent storage before saving on Vercel." },
        { status: 503 },
      );
    const headers = new Headers(request.headers);
    headers.delete("oai-authenticated-user-email");
    headers.delete("oai-authenticated-user-id");
    if (authenticated) {
      headers.set("oai-authenticated-user-id", "server-owner");
      headers.set("oai-authenticated-user-email", "owner@server.local");
    }
    handler ??= loadHandler().catch((error) => {
      handler = undefined;
      throw error;
    });
    return (await handler).fetch(new Request(request, { headers }), {
      BUCKET: localStore,
      SAKAYGO_ADMIN_EMAIL: "owner@server.local",
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY,
      GEOSEARCH_URL: env.GEOSEARCH_URL,
      GEOSEARCH_ATTRIBUTION: env.GEOSEARCH_ATTRIBUTION,
      WALK_ROUTER_URL: env.WALK_ROUTER_URL,
      WALK_ROUTER_TOKEN: env.WALK_ROUTER_TOKEN,
    });
  };

  return dispatch;
}
