import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Tests run against source, not dist, so `vitest` needs no prior build.
  // `pnpm build` type-checks and emits the published artifacts separately.
  resolve: {
    alias: {
      "@jevkit/core": src("./packages/core/src/index.ts"),
      "@jevkit/drift": src("./packages/drift/src/index.ts"),
      "@jevkit/calibrate": src("./packages/calibrate/src/index.ts"),
      "@jevkit/bench": src("./packages/bench/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
