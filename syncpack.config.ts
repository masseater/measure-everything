import { Array, Record, pipe } from "effect";
import type { RcFile } from "syncpack";

import { INSTRUMENTATION, requiredStack } from "./lint.config.ts";

const config: RcFile = {
  versionGroups: [
    {
      label: "OTLP の受け口は OpenTelemetry の SDK から送ってテストする",
      dependencies: [...(requiredStack[INSTRUMENTATION] ?? [])],
      packages: ["@r_masseater/vitest-otlp"],
      dependencyTypes: ["dev"],
    },
    {
      label: "OTLP の受け口のテストが使う OpenTelemetry の SDK の版",
      dependencies: [...(requiredStack[INSTRUMENTATION] ?? [])],
      packages: ["pnpm-workspace.yaml"],
    },
    {
      label: "Workers のスパンは Miniflare で Worker を動かしてテストする",
      dependencies: ["miniflare"],
      packages: ["@r_masseater/vitest-otlp"],
      dependencyTypes: ["dev"],
    },
    {
      label: "Workers のスパンのテストが使う Miniflare の版",
      dependencies: ["miniflare"],
      packages: ["pnpm-workspace.yaml"],
    },
    ...pipe(
      Record.toEntries(requiredStack),
      Array.map(([label, dependencies]) => ({
        label,
        dependencies: [...dependencies],
        isBanned: true as const,
      })),
    ),
  ],
};

export default config;
