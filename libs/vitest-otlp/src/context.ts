type SemconvLevel = "violation" | "improvement" | "information";

interface SemconvOptions {
  readonly registry?: string;
  readonly weaver?: string;
  readonly failOn?: SemconvLevel;
}

interface ResolvedSemconv {
  readonly registry: string;
  readonly weaver: string;
  readonly failOn: SemconvLevel;
}

const SEMCONV_KEY = "vitest-otlp:semconv";
const FORWARD_KEY = "vitest-otlp:forward";

declare module "vite-plus/test" {
  interface ProvidedContext {
    readonly [SEMCONV_KEY]?: ResolvedSemconv;
    readonly [FORWARD_KEY]?: readonly string[];
  }
}

export { FORWARD_KEY, SEMCONV_KEY };
export type { ResolvedSemconv, SemconvLevel, SemconvOptions };
