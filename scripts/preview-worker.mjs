import { createServer } from "node:http";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import worker from "../dist/server/index.js";
const root = new URL("../.local-admin/", import.meta.url);
await fs.mkdir(root, { recursive: true });
let queue = Promise.resolve();
const BUCKET = {
  async get(key) {
    try {
      const value = await fs.readFile(
        new URL(createHash("sha256").update(key).digest("hex") + ".json", root),
        "utf8",
      );
      return {
        etag: createHash("sha256").update(value).digest("hex"),
        json: async () => JSON.parse(value),
      };
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
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
      await fs.writeFile(
        new URL(createHash("sha256").update(key).digest("hex") + ".tmp", root),
        value,
      );
      await fs.rename(
        new URL(createHash("sha256").update(key).digest("hex") + ".tmp", root),
        new URL(createHash("sha256").update(key).digest("hex") + ".json", root),
      );
      return { etag: createHash("sha256").update(value).digest("hex") };
    });
    queue = task.catch(() => {});
    return task;
  },
};
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers))
      if (val) headers.set(key, String(val));
    headers.delete("oai-authenticated-user-email");
    headers.delete("oai-authenticated-user-id");
    // Local-only owner simulation is an explicit process flag, never a request header.
    if (process.env.SAKAYGO_LOCAL_ADMIN === "1") {
      headers.set("oai-authenticated-user-id", "local-owner");
      headers.set("oai-authenticated-user-email", "local@localhost");
    }
    const response = await worker.fetch(
      new Request(`http://127.0.0.1:5174${req.url}`, {
        method: req.method,
        headers,
        ...(!["GET", "HEAD"].includes(req.method)
          ? { body: Buffer.concat(chunks) }
          : {}),
      }),
      {
        BUCKET,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
        SAKAYGO_ADMIN_EMAIL: "local@localhost",
        GEOSEARCH_URL: process.env.GEOSEARCH_URL,
        GEOSEARCH_ATTRIBUTION: process.env.GEOSEARCH_ATTRIBUTION,
        WALK_ROUTER_URL: process.env.WALK_ROUTER_URL,
        WALK_ROUTER_TOKEN: process.env.WALK_ROUTER_TOKEN,
      },
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("Preview error");
  }
});
server.listen(5174, "127.0.0.1", () =>
  console.log(
    "SakayGo preview: http://127.0.0.1:5174 · local owner mode " +
      (process.env.SAKAYGO_LOCAL_ADMIN === "1" ? "enabled" : "disabled"),
  ),
);
