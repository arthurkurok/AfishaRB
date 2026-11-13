import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../lib/config.js";
import * as schema from "./schema.js";

// numeric → string (деньги не теряют точность), bigint id → number
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: Db | null = null;

export function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: config.AFISHA_DATABASE_URL, max: 12 });
  return pool;
}

export function getDb(): Db {
  if (!db) db = drizzle(getPool(), { schema, casing: "snake_case" });
  return db;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
  db = null;
}

export { schema };
