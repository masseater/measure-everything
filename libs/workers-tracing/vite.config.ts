import { otlp } from "@r_masseater/vitest-otlp";
import { defineConfig } from "vite-plus";

const BANNERS: Readonly<Record<string, string>> = { "traces.js": "#!/usr/bin/env node" };

export default defineConfig({
  plugins: [otlp()],
  pack: {
    entry: [
      "src/alchemy.ts",
      "src/effect.ts",
      "src/elysia.ts",
      "src/tanstack-start.ts",
      "src/tanstack-start.browser.ts",
      "src/traces.ts",
    ],
    platform: "neutral",
    banner: ({ fileName }) => BANNERS[fileName],
    sourcemap: true,
    publint: { strict: true },
    attw: { profile: "esm-only", level: "error" },
    dts: true,
    external: [
      /^cloudflare:/u,
      /^node:/u,
      /^alchemy/u,
      /^@alchemy\.run\//u,
      /^@distilled\.cloud\//u,
      /^@effect\/platform-node/u,
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/fixture/**"],
    testTimeout: 60_000,
  },
});
