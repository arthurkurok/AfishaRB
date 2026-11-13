import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.AFISHA_DATABASE_URL ?? "postgres://afisha:afisha@localhost:55432/afisha" },
});
