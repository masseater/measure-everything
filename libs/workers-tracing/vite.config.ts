import { otlp } from "@r_masseater/vitest-otlp";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [otlp()],
  pack: {
    entry: [
      "src/effect.ts",
      "src/elysia.ts",
      "src/tanstack-start.ts",
      "src/tanstack-start.browser.ts",
    ],
    platform: "neutral",
    sourcemap: true,
    publint: { strict: true },
    attw: { profile: "esm-only", level: "error" },
    dts: true,
    external: [/^cloudflare:/u, /^node:/u],
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/fixture/**"],
    testTimeout: 60_000,
  },
});
