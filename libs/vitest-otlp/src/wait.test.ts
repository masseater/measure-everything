import { trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Duration, Effect } from "effect";
import { expect, test } from "vite-plus/test";

import { clearTelemetry, receivedSpans, waitForSpans } from "./index.ts";

const SHORT_WAIT_MILLIS = 50;
const SHORT_WAIT = Duration.millis(SHORT_WAIT_MILLIS);

test("waiting reports how much arrived when the expected telemetry never comes", () =>
  Effect.gen(function* never() {
    const error = yield* Effect.flip(
      waitForSpans({ where: (span) => span.name === "never", timeout: SHORT_WAIT }),
    );
    expect(error.message).toBe("Expected 1 spans within 50ms, received 0 matching of 0.");
  }).pipe(Effect.runPromise));

test("clearing drops what was received so far", () =>
  Effect.gen(function* clearing() {
    const sdk = new NodeSDK();
    sdk.start();
    trace.getTracer("wait").startSpan("before clear").end();
    yield* Effect.promise(() => sdk.shutdown());
    yield* waitForSpans();

    yield* clearTelemetry;

    expect(yield* receivedSpans).toStrictEqual([]);
  }).pipe(Effect.runPromise));
