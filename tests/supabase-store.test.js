import { describe, it, expect, vi } from "vitest";
import { createSupabaseStore, withConfiguredStorage } from "../worker/supabase-store.mjs";
const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test_only" };
const key = "sakaygo/catalog-state-v1.json";
describe("Supabase server storage", () => {
  it("reads the saved document and sends credentials only to the server API", async () => {
    const fetcher = vi.fn(async () => Response.json([{ value: { revision: 5 }, etag: "v5" }]));
    const saved = await createSupabaseStore(env, fetcher).get(key);
    expect(await saved.json()).toEqual({ revision: 5 });
    expect(saved.etag).toBe("v5");
    const [url, options] = fetcher.mock.calls[0];
    expect(url.origin).toBe(env.SUPABASE_URL);
    expect(url.searchParams.get("key")).toBe(`eq.${key}`);
    expect(options.headers.apikey).toBe(env.SUPABASE_SECRET_KEY);
    expect(options.redirect).toBe("error");
  });
  it("handles absent documents and refuses stale conditional writes", async () => {
    const fetcher = vi.fn(async () => Response.json([]));
    const store = createSupabaseStore(env, fetcher);
    expect(await store.get(key)).toBeNull();
    expect(await store.put(key, '{}', { onlyIf: { etagMatches: "stale" } })).toBeNull();
    const [url, options] = fetcher.mock.calls[1];
    expect(url.searchParams.get("etag")).toBe("eq.stale");
    expect(options.method).toBe("PATCH");
  });
  it("does not overwrite an existing document on initialization", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 409 }));
    expect(await createSupabaseStore(env, fetcher).put(key, '{}', { onlyIf: { etagDoesNotMatch: "*" } })).toBeNull();
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
  });
  it("returns the new database version after an accepted write", async () => {
    const fetcher = vi.fn(async (_url, options) => Response.json([{ etag: JSON.parse(options.body).etag }]));
    const result = await createSupabaseStore(env, fetcher).put(key, '{"revision":6}', { onlyIf: { etagMatches: "v5" } });
    expect(result.etag).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).value).toEqual({ revision: 6 });
  });
  it("fails closed on outages without disclosing backend responses or secrets", async () => {
    const store = createSupabaseStore(env, async () => new Response("sensitive backend detail", { status: 503 }));
    await expect(store.get(key)).rejects.toThrow("Supabase storage read failed (503)");
    await expect(store.put(key, '{}', { onlyIf: { etagMatches: "v1" } })).rejects.toThrow("Supabase storage write failed (503)");
  });
  it("keeps R2 when unconfigured and rejects incomplete or unsafe configuration", async () => {
    const old = { BUCKET: {} };
    expect(withConfiguredStorage(old)).toBe(old);
    expect(() => withConfiguredStorage({ ...old, SUPABASE_URL: env.SUPABASE_URL })).toThrow();
    expect(() => createSupabaseStore({ ...env, SUPABASE_URL: "http://example.supabase.co" })).toThrow();
    expect(() => createSupabaseStore({ ...env, SUPABASE_SECRET_KEY: "sb_publishable_example" })).toThrow();
    await expect(createSupabaseStore(env).put(key, '{}', {})).rejects.toThrow("Conditional writes");
    await expect(createSupabaseStore(env).get("another-app")).rejects.toThrow("Unsupported storage key");
  });
  it("migrates an existing R2 document once and preserves subsequent database changes", async () => {
    let row;
    const previous = { revision: 7, settings: { announcement: "Preserve this" } };
    const source = { get: vi.fn(async () => ({ json: async () => previous })) };
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      if (options.method === "POST") row = JSON.parse(options.body);
      return Response.json(row ? [row] : []);
    }));
    try {
      const configured = withConfiguredStorage({ ...env, BUCKET: source, SUPABASE_IMPORT_R2: "1" }, async (_key, state) => state);
      expect(await (await configured.BUCKET.get(key)).json()).toEqual(previous);
      row.value = { revision: 8 };
      expect(await (await configured.BUCKET.get(key)).json()).toEqual({ revision: 8 });
      expect(source.get).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
});
