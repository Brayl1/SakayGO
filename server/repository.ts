import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { demoData } from "../shared/data";
import { datasetSchema } from "../shared/validation";
import type { Dataset } from "../shared/model";
export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    })
  : null;
export function datasetSource(demo: boolean) {
  return demo ? "synthetic_demo" : pool ? "postgres_dataset_releases" : process.env.DATASET_PATH ? "dataset_file" : "bundled_landmarks_only";
}
export async function getDataset(demo: boolean): Promise<Dataset> {
  if (demo) return demoData;
  if (pool) {
    const { rows } = await pool.query(
      "select payload from dataset_releases where active = true order by created_at desc limit 1",
    );
    return rows.length
      ? datasetSchema.parse(rows[0].payload)
      : { locations: demoData.locations, routes: [], policies: [] };
  }
  if (process.env.DATASET_PATH)
    return datasetSchema.parse(
      JSON.parse(await readFile(process.env.DATASET_PATH, "utf8")),
    );
  return { locations: demoData.locations, routes: [], policies: [] };
}
