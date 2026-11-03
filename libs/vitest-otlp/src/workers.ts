import { fileURLToPath } from "node:url";

import { Array, Effect, Option, Predicate, Schema, pipe } from "effect";
import { build } from "vite-plus";

import type { ReceiverNotRunning } from "./store.ts";
import { currentReceiver } from "./store.ts";

const taggedError = Schema.TaggedError;

class TailWorkerBuildFailed extends taggedError<
  TailWorkerBuildFailed,
  { readonly brand: unique symbol }
>()("TailWorkerBuildFailed", { message: Schema.String }) {}

interface TailWorker {
  name: string;
  compatibilityDate: string;
  modules: { type: "ESModule"; path: string; contents: string }[];
  bindings: Record<string, string>;
}

interface TailWorkerOptions {
  readonly name?: string;
  readonly compatibilityDate?: string;
}

const DEFAULT_NAME = "vitest-otlp-tail";
const DEFAULT_COMPATIBILITY_DATE = "2026-07-01";
const ENTRY = "@r_masseater/vitest-otlp/tail-worker";
const WORKER_CONDITIONS = ["workerd", "worker", "browser", "import", "default"];

const failed = (message: string): TailWorkerBuildFailed => TailWorkerBuildFailed.make({ message });

const chunkCode = (output: unknown): Option.Option<string> =>
  pipe(
    Array.head(Array.ensure(output)),
    Option.filter(Predicate.hasProperty("output")),
    Option.map((result) => result.output),
    Option.filter(Predicate.isIterable),
    Option.flatMap((chunks) => Array.head(Array.fromIterable(chunks))),
    Option.filter(Predicate.hasProperty("code")),
    Option.map((chunk) => chunk.code),
    Option.filter(Predicate.isString),
  );

const bundle: Effect.Effect<string, TailWorkerBuildFailed> = Effect.tryPromise({
  try: () =>
    build({
      configFile: false,
      logLevel: "silent",
      resolve: { conditions: WORKER_CONDITIONS },
      build: {
        write: false,
        minify: false,
        target: "esnext",
        lib: {
          entry: fileURLToPath(import.meta.resolve(ENTRY)),
          formats: ["es"],
          fileName: "tail",
        },
      },
    }),
  catch: (cause) => failed(`Bundling the tail worker failed: ${String(cause)}`),
}).pipe(
  Effect.flatMap((output) =>
    Effect.fromOption(chunkCode(output)).pipe(
      Effect.mapError(() => failed("Bundling the tail worker produced no code.")),
    ),
  ),
  Effect.withSpan("vitest-otlp.tail-worker.bundle"),
);

const tailWorker = ({
  name = DEFAULT_NAME,
  compatibilityDate = DEFAULT_COMPATIBILITY_DATE,
}: TailWorkerOptions = {}): Effect.Effect<TailWorker, TailWorkerBuildFailed | ReceiverNotRunning> =>
  Effect.all([bundle, currentReceiver]).pipe(
    Effect.map(([contents, receiver]) => ({
      name,
      compatibilityDate,
      modules: [{ type: "ESModule", path: "tail.worker.mjs", contents }],
      bindings: { OTEL_EXPORTER_OTLP_ENDPOINT: receiver.address.httpEndpoint },
    })),
  );

export { TailWorkerBuildFailed, tailWorker };
export type { TailWorker, TailWorkerOptions };
