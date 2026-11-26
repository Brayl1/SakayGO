import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { plan } from "../shared/engine";
import { planSchema } from "../shared/validation";
import { getDataset, pool, datasetSource } from "./repository";
import { createCatalogApi } from "./catalog-api.mjs";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "16kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 90,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again in a minute." },
  }),
);
// Synthetic services are retired in the released application.
app.use("/api", (req, res, next) => {
  if (req.query.demo === "true" || req.body?.demo === true) {
    res.status(410).json({ error: "Demo mode has been retired. Use the route planner.", planner: "/planner" });
    return;
  }
  next();
});
app.get("/api/health", (_req, res) =>
  res.json({
    status: "ok",
    storage: pool ? "postgres" : "local",
    catalogStorage: process.env.SUPABASE_URL ? "supabase" : "local",
    contracts: { catalog: "/api/catalog", stopPlanner: "/api/dataset" },
    verifiedData: "Requires an imported, sourced dataset",
  }),
);
app.get("/api/dataset", async (req, res) => {
  const demo = req.query.demo === "true";
  const data = await getDataset(demo);
  res.json({
    ...data,
    mode: demo ? "demo" : "verified",
    source: datasetSource(demo),
    routes: data.routes.filter((r) =>
      demo ? r.status === "demo" : r.status === "verified",
    ),
    policies: data.policies.filter((p) => p.demo === demo),
  });
});
app.get("/api/locations", async (req, res) => {
  const data = await getDataset(req.query.demo === "true");
  const q = String(req.query.q || "")
    .slice(0, 100)
    .toLowerCase();
  res.json({
    locations: data.locations
      .filter((l) => l.name.toLowerCase().includes(q))
      .slice(0, 30),
  });
});
app.get("/api/routes", async (req, res) => {
  const demo = req.query.demo === "true";
  const data = await getDataset(demo);
  res.json({
    routes: data.routes
      .filter((r) => (demo ? r.status === "demo" : r.status === "verified"))
      .map(({ geometry, ...r }) => r),
  });
});
app.get("/api/routes/:id", async (req, res) => {
  const demo = req.query.demo === "true";
  const data = await getDataset(demo);
  const route = data.routes.find(
    (r) =>
      r.id === req.params.id &&
      (demo ? r.status === "demo" : r.status === "verified"),
  );
  if (!route) {
    res.status(404).json({ error: "Route not found" });
    return;
  }
  res.json({ route });
});
app.get("/api/policies", async (req, res) => {
  const demo = req.query.demo === "true";
  res.json({
    policies: (await getDataset(demo)).policies.filter((p) => p.demo === demo),
  });
});
app.get("/api/nearby", async (req, res) => {
  const query = z
    .object({
      lat: z.coerce.number().min(8.2).max(8.7),
      lng: z.coerce.number().min(124.3).max(124.9),
      meters: z.coerce.number().min(1).max(2000).default(500),
    })
    .parse(req.query);
  if (!pool) {
    res
      .status(503)
      .json({
        error:
          "Geospatial database is not configured. Select a named landmark.",
      });
    return;
  }
  const { rows } = await pool.query(
    "select id,name,ST_Y(position::geometry) lat,ST_X(position::geometry) lng from locations where ST_DWithin(position, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3) limit 30",
    [query.lng, query.lat, query.meters],
  );
  res.json({
    locations: rows,
    note: "Proximity does not verify boarding access.",
  });
});
app.post("/api/plan", async (req, res) => {
  const input = planSchema.parse(req.body);
  if (input.from === input.to) {
    res.status(400).json({ error: "Choose different locations" });
    return;
  }
  const data = await getDataset(input.demo);
  if (
    ![input.from, input.to].every((id) =>
      data.locations.some((l) => l.id === id),
    )
  ) {
    res.status(400).json({ error: "Choose recognized locations" });
    return;
  }
  res.json({
    mode: input.demo ? "demo" : "verified",
    journeys: plan(
      data,
      input.from,
      input.to,
      input.passenger,
      input.demo,
      input.maxTransfers,
    ),
  });
});
const catalogApi = createCatalogApi();
const currentApiPaths = new Set([
  "/api/session", "/api/catalog", "/api/fare-policies/current",
  "/api/fare-reference", "/api/route-codes", "/api/places",
  "/api/trips/plan", "/api/test-cases",
]);
app.use(async (req, res, next) => {
  if (!currentApiPaths.has(req.path) && !req.path.startsWith("/api/catalog/") && !req.path.startsWith("/api/admin/"))
    return next();
  const headers = new Headers();
  for (const name of ["content-type", "if-match", "origin"])
    if (req.get(name)) headers.set(name, req.get(name)!);
  headers.set("cf-connecting-ip", req.socket.remoteAddress || "local");
  const response = await catalogApi(new Request(`http://127.0.0.1:3001${req.originalUrl}`, {
    method: req.method,
    headers,
    ...(!["GET", "HEAD"].includes(req.method) && req.body !== undefined
      ? { body: JSON.stringify(req.body) } : {}),
  }));
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
});
app.use((_req, res) => res.status(404).json({ error: "Endpoint not found" }));
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const bad = error instanceof z.ZodError || error instanceof SyntaxError;
    const tooLarge = typeof error === "object" && error !== null && "status" in error && error.status === 413;
    res
      .status(tooLarge ? 413 : bad ? 400 : 503)
      .json({
        error: tooLarge ? "Request body exceeds the API limit." : bad
          ? "Invalid request. Check your locations and options."
          : "Service is temporarily unavailable. Please retry.",
      });
  },
);
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(Number(process.env.PORT || 3001), "127.0.0.1", () =>
    console.log("SakayGo API: http://127.0.0.1:" + (process.env.PORT || 3001)),
  );
  process.on("SIGTERM", () =>
    server.close(() => {
      void pool?.end();
    }),
  );
}
