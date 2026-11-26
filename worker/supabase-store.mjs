// Server-only adapter preserving the existing atomic ETag storage contract.
export function createSupabaseStore(env, request = fetch) {
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/")
    throw new Error("Invalid Supabase project URL");
  const secret = env.SUPABASE_SECRET_KEY;
  if (!secret || !secret.startsWith("sb_secret_"))
    throw new Error("A server-only Supabase secret key is required");
  const endpoint = new URL("/rest/v1/sakaygo_documents", url);
  async function send(query, method = "GET", body) {
    const target = new URL(endpoint);
    target.search = new URLSearchParams(query).toString();
    return request(target, {
      method,
      headers: {
        apikey: secret,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  }
  function checkKey(key) {
    if (!["sakaygo/catalog-state-v1.json", "sakaygo/verification-v1.json"].includes(key))
      throw new Error("Unsupported storage key");
  }
  return {
    async get(key) {
      checkKey(key);
      const result = await send({ key: `eq.${key}`, select: "value,etag", limit: "1" });
      if (!result.ok) throw new Error(`Supabase storage read failed (${result.status})`);
      const rows = await result.json();
      if (!Array.isArray(rows)) throw new Error("Invalid storage response");
      return rows.length ? { etag: rows[0].etag, json: async () => rows[0].value } : null;
    },
    async put(key, value, options) {
      checkKey(key);
      const insert = options?.onlyIf?.etagDoesNotMatch === "*";
      const expected = options?.onlyIf?.etagMatches;
      if (!insert && !expected) throw new Error("Conditional writes are required");
      const etag = crypto.randomUUID();
      const result = await send(
        insert ? {} : { key: `eq.${key}`, etag: `eq.${expected}` },
        insert ? "POST" : "PATCH",
        { ...(insert ? { key } : {}), value: JSON.parse(value), etag, updated_at: new Date().toISOString() },
      );
      if (insert && result.status === 409) return null;
      if (!result.ok) throw new Error(`Supabase storage write failed (${result.status})`);
      const rows = await result.json();
      if (!Array.isArray(rows)) throw new Error("Invalid storage response");
      return rows.length ? { etag: rows[0].etag } : null;
    },
  };
}

export function withConfiguredStorage(env, initialize) {
  if (env.SUPABASE_URL || env.SUPABASE_SECRET_KEY) {
    const store = createSupabaseStore(env);
    if (env.SUPABASE_IMPORT_R2 === "1") {
      if (!env.BUCKET || !initialize) throw new Error("Migration source unavailable");
      const read = store.get.bind(store);
      store.get = async (key) => {
        const existing = await read(key);
        if (existing) return existing;
        const previous = await env.BUCKET.get(key);
        const state = await initialize(key, previous ? await previous.json() : null);
        await store.put(key, JSON.stringify(state), { onlyIf: { etagDoesNotMatch: "*" } });
        const saved = await read(key);
        if (!saved) throw new Error("Database migration read-back failed");
        return saved;
      };
    }
    return { ...env, BUCKET: store };
  }
  return env;
}
