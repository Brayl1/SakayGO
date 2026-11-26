import { readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { datasetSchema } from "../shared/validation";
async function main() {
  const filename = process.argv[2];
  if (!filename)
    throw new Error("Usage: npm run import:data -- dataset.json [--database]");
  const data = datasetSchema.parse(
    JSON.parse(await readFile(filename, "utf8")),
  );
  if (!process.argv.includes("--database")) {
    await writeFile("verified-data.json", JSON.stringify(data, null, 2));
    console.log(
      "Validated dataset saved. Set DATASET_PATH=verified-data.json for local API storage.",
    );
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(724196)");
      for (const l of data.locations)
        await client.query(
          "INSERT INTO locations(id,name,category,position) VALUES($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326)::geography) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,position=excluded.position",
          [l.id, l.name, l.category, l.point[1], l.point[0]],
        );
      for (const p of data.policies) {
        await client.query(
          "INSERT INTO sources(id,organization,reference,collected_on,verification_status) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET reference=excluded.reference",
          [
            "policy-" + p.id,
            "Dataset policy source",
            p.source,
            p.effective,
            p.demo ? "demo" : "verified",
          ],
        );
        await client.query(
          "INSERT INTO fare_policies(id,source_id,effective_on,expires_on,classification,base,base_km,per_km,discount,round_to,demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,effective_on=excluded.effective_on,expires_on=excluded.expires_on,base=excluded.base,base_km=excluded.base_km,per_km=excluded.per_km,discount=excluded.discount,round_to=excluded.round_to,demo=excluded.demo",
          [
            p.id,
            "policy-" + p.id,
            p.effective,
            p.expires,
            "Dataset-defined jeepney class",
            p.base,
            p.baseKm,
            p.perKm,
            p.discount,
            p.roundTo,
            p.demo,
          ],
        );
      }
      for (const r of data.routes) {
        await client.query(
          "INSERT INTO sources(id,organization,reference,collected_on,verification_status) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET reference=excluded.reference,verification_status=excluded.verification_status",
          [
            "route-" + r.id,
            "Dataset route source",
            r.source,
            r.verifiedAt || new Date().toISOString().slice(0, 10),
            r.status,
          ],
        );
        await client.query(
          "INSERT INTO routes(id,name,signboard,direction,area,status,verified_on,source_id,policy_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET name=excluded.name,signboard=excluded.signboard,direction=excluded.direction,area=excluded.area,status=excluded.status,verified_on=excluded.verified_on,source_id=excluded.source_id,policy_id=excluded.policy_id",
          [
            r.id,
            r.name,
            r.signboard,
            r.direction,
            r.area,
            r.status,
            r.verifiedAt,
            "route-" + r.id,
            data.policies.some((p) => p.id === r.policyId) ? r.policyId : null,
          ],
        );
        await client.query(
          "INSERT INTO route_geometry(route_id,path) VALUES($1,ST_SetSRID(ST_GeomFromGeoJSON($2),4326)) ON CONFLICT(route_id) DO UPDATE SET path=excluded.path",
          [
            r.id,
            JSON.stringify({
              type: "LineString",
              coordinates: r.geometry.map((p) => [p[1], p[0]]),
            }),
          ],
        );
        await client.query("DELETE FROM route_stops WHERE route_id=$1", [r.id]);
        for (let i = 0; i < r.stops.length; i++) {
          await client.query(
            "INSERT INTO stops(id,landmark,source_id) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
            [
              r.stops[i],
              data.locations.find((l) => l.id === r.stops[i])!.name,
              "route-" + r.id,
            ],
          );
          await client.query(
            "INSERT INTO route_stops(route_id,stop_id,sequence,pickup,dropoff) VALUES($1,$2,$3,$4,$5)",
            [
              r.id,
              r.stops[i],
              i,
              r.pickup?.[i] ?? true,
              r.dropoff?.[i] ?? true,
            ],
          );
        }
      }
      await client.query(
        "UPDATE dataset_releases SET active=false WHERE active",
      );
      await client.query(
        "INSERT INTO dataset_releases(active,payload) VALUES(true,$1)",
        [JSON.stringify(data)],
      );
      await client.query("COMMIT");
      console.log(
        "Dataset imported transactionally. No verification claims were inferred.",
      );
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
      await pool.end();
    }
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
});
