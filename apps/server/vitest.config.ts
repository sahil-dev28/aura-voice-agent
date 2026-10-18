import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    env: {
      NODE_ENV: "test",
      GEMINI_API_KEY: "test-key",
      CORS_ORIGIN: "http://localhost:3000, http://localhost:3001",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
