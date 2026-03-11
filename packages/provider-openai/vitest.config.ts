import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 1,
        minForks: 1,
      },
    },
    watch: false,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    teardownTimeout: 5_000,
  },
});

