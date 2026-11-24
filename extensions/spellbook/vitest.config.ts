import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

function stub(name: string): string {
  return fileURLToPath(new URL(`./tests/stubs/${name}.ts`, import.meta.url));
}

export default defineConfig({
  resolve: {
    alias: {
      // these modules only work inside Raycast, so the tests run against in-memory stand-ins
      "@raycast/api": stub("raycast-api"),
      "@raycast/utils": stub("raycast-utils"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
