import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  migrations: {
    prefix: "timestamp",
  },
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/agentmesh",
  },
});
