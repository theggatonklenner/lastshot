import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Server-only modules are fine to import in tests.
      "server-only": path.resolve(__dirname, "test/empty-module.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
    },
  },
});
