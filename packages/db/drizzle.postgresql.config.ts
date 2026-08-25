import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/postgresql.ts",
  out: "./drizzle/postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "postgresql://dashboard:dashboard@localhost:5432/dashboard_test",
  },
  strict: true,
});
