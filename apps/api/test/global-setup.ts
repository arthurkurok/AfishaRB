/**
 * Изоляция тестовых прогонов: каждый `vitest run` получает собственную временную базу.
 * Так параллельные прогоны (например, несколько присяжных с `make check`) не мешают друг другу.
 */
import pg from "pg";

const ADMIN_URL = process.env.AFISHA_TEST_ADMIN_URL ?? "postgres://afisha:afisha@localhost:55432/afisha";

export default async function setup() {
  const name = `afisha_test_${process.pid}_${Date.now().toString(36)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  process.env.AFISHA_DATABASE_URL = url.toString();
  return async () => {
    const c = new pg.Client({ connectionString: ADMIN_URL });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await c.end();
  };
}
