import { otlp } from "@r_masseater/vitest-otlp";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [otlp()],
  pack: {
    entry: ["src/main.ts"],
    platform: "node",
    sourcemap: true,
    banner: "#!/usr/bin/env node",
  },
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
