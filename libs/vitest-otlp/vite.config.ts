import { defineConfig } from "vite-plus";

import { otlp } from "./src/index.ts";

export default defineConfig({
  plugins: [otlp()],
  pack: {
    entry: ["src/index.ts", "src/setup.ts", "src/semconv.ts"],
    platform: "node",
    sourcemap: true,
    dts: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/semconv-fixture/**"],
  },
});
