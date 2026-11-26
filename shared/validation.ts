import { z } from "zod";
const point = z.tuple([
  z.number().min(8.2).max(8.7),
  z.number().min(124.3).max(124.9),
]);
const text = z.string().min(1).max(500);
export const datasetSchema = z
  .object({
    locations: z
      .array(z.object({ id: text, name: text, category: text, point }))
      .max(10000),
    policies: z
      .array(
        z.object({
          id: text,
          source: text,
          effective: z.iso.date(),
          expires: z.iso.date(),
          demo: z.boolean(),
          base: z.number().nonnegative(),
          baseKm: z.number().nonnegative(),
          perKm: z.number().nonnegative(),
          discount: z.number().min(0).max(1),
          roundTo: z.number().positive(),
        }),
      )
      .max(100),
    routes: z
      .array(
        z.object({
          id: text,
          name: text,
          signboard: text,
          area: text,
          direction: text,
          status: z.enum(["demo", "verified", "unverified"]),
          verifiedAt: z.iso.date().nullable(),
          source: text,
          stops: z.array(text).min(2).max(200),
          geometry: z.array(point).min(2).max(200),
          policyId: text,
          pickup: z.array(z.boolean()).optional(),
          dropoff: z.array(z.boolean()).optional(),
        }),
      )
      .max(1000),
  })
  .superRefine((data, ctx) => {
    for (const collection of [data.locations, data.policies, data.routes]) {
      if (new Set(collection.map((x) => x.id)).size !== collection.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate IDs are not allowed",
        });
    }
    for (const p of data.policies)
      if (p.effective > p.expires)
        ctx.addIssue({ code: "custom", message: "Invalid policy date range" });
    for (const r of data.routes) {
      const issue = (message: string) =>
        ctx.addIssue({ code: "custom", message: `${r.id}: ${message}` });
      if (r.stops.length !== r.geometry.length)
        issue(
          "Supply one geometry vertex per ordered stop; use surveyed shape points as non-pickup/non-dropoff nodes",
        );
      if (new Set(r.stops).size !== r.stops.length)
        issue("Repeated stops require separate direction or segment records");
      if (
        (r.pickup && r.pickup.length !== r.stops.length) ||
        (r.dropoff && r.dropoff.length !== r.stops.length)
      )
        issue("Permission arrays must match stop count");
      for (let i = 0; i < r.stops.length; i++) {
        const loc = data.locations.find((l) => l.id === r.stops[i]);
        if (!loc) issue("Unknown stop");
        else if (
          r.geometry[i] &&
          JSON.stringify(loc.point) !== JSON.stringify(r.geometry[i])
        )
          issue("Stop coordinate does not match geometry");
      }
      if (
        r.status === "verified" &&
        (!r.verifiedAt || r.verifiedAt > new Date().toISOString().slice(0, 10))
      )
        issue("Verified route requires a nonfuture verification date");
      const policy = data.policies.find((p) => p.id === r.policyId);
      if (policy && r.status === "verified" && policy.demo)
        issue("Verified route cannot use demo policy");
    }
  });
export const planSchema = z
  .object({
    from: text,
    to: text,
    passenger: z
      .enum(["regular", "student", "senior", "pwd"])
      .default("regular"),
    demo: z.boolean().default(false),
    maxTransfers: z.number().int().min(0).max(3).default(1),
  })
  .strict();
