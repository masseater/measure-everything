import { Effect } from "effect";
import { expect, test } from "vite-plus/test";

import { decodeLogs, decodeMetrics, decodeSpans } from "./otlp-schema.ts";

const bareSpan = { traceId: "a", spanId: "b", name: "bare" };

test("fields an exporter leaves out get empty defaults", () =>
  Effect.gen(function* defaults() {
    expect(
      yield* decodeSpans({ resourceSpans: [{ scopeSpans: [{ spans: [bareSpan] }] }] }),
    ).toStrictEqual([
      {
        ...bareSpan,
        kind: "SPAN_KIND_UNSPECIFIED",
        startTimeUnixNano: "0",
        endTimeUnixNano: "0",
        attributes: {},
        events: [],
        links: [],
        status: {},
        resource: {},
        scope: { name: "" },
      },
    ]);
    expect(
      yield* decodeLogs({ resourceLogs: [{ scopeLogs: [{ logRecords: [{ body: "bare" }] }] }] }),
    ).toStrictEqual([{ body: "bare", attributes: {}, resource: {}, scope: { name: "" } }]);
  }).pipe(Effect.runPromise));

test("a metric is labelled with the kind of data it carries", () =>
  Effect.gen(function* labelled() {
    const metrics = yield* decodeMetrics({
      resourceMetrics: [
        {
          resource: { attributes: { "service.name": "s" } },
          scopeMetrics: [
            {
              scope: { name: "m", version: "1" },
              metrics: [{ name: "latency", unit: "ms", histogram: { dataPoints: [{ count: 1 }] } }],
            },
          ],
        },
      ],
    });

    expect(metrics).toStrictEqual([
      {
        name: "latency",
        unit: "ms",
        type: "histogram",
        dataPoints: [{ count: 1 }],
        resource: { "service.name": "s" },
        scope: { name: "m", version: "1" },
      },
    ]);
  }).pipe(Effect.runPromise));
