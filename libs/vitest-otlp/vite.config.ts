import { defineConfig } from "vite-plus";

import { otlp } from "./src/index.ts";

export default defineConfig({
  plugins: [otlp()],
  pack: [
    {
      entry: ["src/index.ts", "src/setup.ts", "src/semconv.ts", "src/workers.ts"],
      platform: "node",
      sourcemap: true,
      dts: true,
    },
    { entry: ["src/tail.worker.ts"], platform: "neutral", sourcemap: true, dts: false },
  ],
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/semconv-fixture/**"],
  },
});
