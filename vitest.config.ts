import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
