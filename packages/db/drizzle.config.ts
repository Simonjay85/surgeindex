import "./src/env.js";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: false,
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      "postgresql://surge:surge@localhost:5432/surgeindex",
  },
});
