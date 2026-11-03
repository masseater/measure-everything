import { logs, metrics, trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Array, Effect, Option } from "effect";
import { expect, test } from "vite-plus/test";

import { waitForLogs, waitForMetrics, waitForSpans } from "./index.ts";

const ORDER = { "order.id": "o-1" };
const ONE_ORDER = 1;

const emitCheckout = Effect.sync(() => {
  trace.getTracer("checkout").startActiveSpan("charge card", (span) => {
    span.setAttributes(ORDER);
    span.end();
  });
  logs.getLogger("checkout").emit({ body: "card charged", attributes: ORDER });
  metrics.getMeter("checkout").createCounter("orders").add(ONE_ORDER, { region: "jp" });
});

test("NodeSDK configured only from the environment exports all three signals", () =>
  Effect.gen(function* nodeSdk() {
    const sdk = new NodeSDK({ serviceName: "node-sdk-test" });
    sdk.start();
    yield* emitCheckout;
    yield* Effect.promise(() => sdk.shutdown());

    const receivedSpans = yield* waitForSpans({ where: (span) => span.name === "charge card" });
    expect(receivedSpans).toMatchObject([
      {
        attributes: ORDER,
        resource: { "service.name": "node-sdk-test" },
        scope: { name: "checkout" },
      },
    ]);

    const receivedLogs = yield* waitForLogs({ where: (log) => log.body === "card charged" });
    expect(Option.map(Array.head(receivedLogs), (log) => log.attributes)).toStrictEqual(
      Option.some(ORDER),
    );

    const orders = yield* waitForMetrics({ where: (metric) => metric.name === "orders" });
    expect(orders).toMatchObject([{ type: "sum", dataPoints: [{ attributes: { region: "jp" } }] }]);
  }).pipe(Effect.runPromise));
