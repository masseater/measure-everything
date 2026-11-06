import { Array, Effect, Layer, ManagedRuntime, Metric, Option } from "effect";
import { FetchHttpClient } from "effect/http";
import { Otlp, OtlpSerialization } from "effect/observability";
import { expect, test } from "vite-plus/test";

import { waitForLogs, waitForMetrics, waitForSpans } from "./index.ts";

const telemetry = Otlp.layerFromConfig({ resource: { serviceName: "effect-test" } }).pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer),
);

const ONE_ORDER = 1;
const orders = Metric.counter("effect_orders");

const placeOrder = Effect.gen(function* placeOrder() {
  yield* Effect.logInfo("order placed");
  yield* Metric.update(orders, ONE_ORDER);
}).pipe(Effect.withSpan("place order", { attributes: { "order.id": "o-2" } }));

test("Effect's OTLP layers configured from the environment export over OTLP/JSON", () =>
  Effect.gen(function* effectOtlp() {
    const runtime = ManagedRuntime.make(telemetry);
    const context = yield* runtime.contextEffect;
    yield* Effect.provideContext(placeOrder, context);
    yield* runtime.disposeEffect;

    const spans = yield* waitForSpans({ where: (span) => span.name === "place order" });
    expect(spans).toMatchObject([
      { attributes: { "order.id": "o-2" }, resource: { "service.name": "effect-test" } },
    ]);

    const logs = yield* waitForLogs({ where: (log) => log.body === "order placed" });
    expect(Option.map(Array.head(logs), (log) => log.traceId)).toStrictEqual(
      Option.map(Array.head(spans), (span) => span.traceId),
    );

    yield* waitForMetrics({ where: (metric) => metric.name === "effect_orders" });
  }).pipe(Effect.runPromise));
