import { waitForSpans } from "@r_masseater/vitest-otlp";
import { Effect, Layer, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/http";
import { Otlp, OtlpSerialization } from "effect/observability";
import { test } from "vite-plus/test";

const SPAN_NAME = "work";
const HTTP_OK = 200;

const telemetry = Otlp.layerFromConfig({ resource: { serviceName: "semconv-fixture" } }).pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer),
);

const exportSpan = (attributes: Readonly<Record<string, unknown>>): Promise<void> =>
  Effect.gen(function* spanExport() {
    const runtime = ManagedRuntime.make(telemetry);
    yield* Effect.provideContext(
      Effect.withSpan(Effect.void, SPAN_NAME, { attributes }),
      yield* runtime.contextEffect,
    );
    yield* runtime.disposeEffect;
    yield* waitForSpans({ where: (span) => span.name === SPAN_NAME });
  }).pipe(Effect.runPromise);

test("conforming", () => exportSpan({ "http.response.status_code": HTTP_OK }));

test("violating", () => exportSpan({ "http.response.status_code": String(HTTP_OK) }));
