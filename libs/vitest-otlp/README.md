# @r_masseater/vitest-otlp

A Vitest plugin that receives OTLP during tests. A test can then assert the
spans, metrics and logs that the code under test really exported. It shows that
auto-instrumentation and `OTEL_*` settings work. It also shows that telemetry
actually leaves the process.

It requires [Vite+](https://viteplus.dev/) and Node.js 26 or later.

```sh
vp add -D @r_masseater/vitest-otlp
```

```ts
import { otlp } from "@r_masseater/vitest-otlp";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [otlp()],
});
```

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { waitForSpans } from "@r_masseater/vitest-otlp";
import { Effect } from "effect";
import { expect, test } from "vite-plus/test";

test("checkout is traced", () =>
  Effect.gen(function* () {
    const sdk = new NodeSDK();
    sdk.start();
    yield* checkout;
    yield* Effect.promise(() => sdk.shutdown());

    const spans = yield* waitForSpans({
      where: (span) => span.name === "checkout",
    });
    expect(spans).toMatchObject([{ attributes: { "order.id": "o-1" } }]);
  }).pipe(Effect.runPromise));
```

## How it works

Each test file gets its own OTLP receiver on free loopback ports. It serves
OTLP/HTTP with protobuf or JSON, and OTLP/gRPC. Both accept gzip. Messages are
decoded with code that [protobuf-es](https://github.com/bufbuild/protobuf-es)
generated from
[opentelemetry-proto](https://github.com/open-telemetry/opentelemetry-proto)
v1.11.1.

The test learns the receiver through the standard environment variables. An SDK
that reads its configuration from the environment sends to it without code
changes. Child processes of the test inherit the variables. They send to the
same receiver.

An in-memory exporter skips the real export path. This plugin instead sends
over OTLP and reads the environment, just as production does. A Collector or
grafana/otel-lgtm in a container needs Docker. This plugin needs none, and the
test reads what arrived directly.

## API

The read API is written with Effect.

`waitForSpans`, `waitForLogs` and `waitForMetrics` wait for items that match
`where`. They reread every `interval` until `count` items arrive, and return all
matches. The defaults are 20 ms and 1. After `timeout` they fail with
`TelemetryNotReceived`, which carries how many arrived. The default timeout is
5 seconds.

`receivedSpans`, `receivedLogs` and `receivedMetrics` return everything that has
arrived in the test file so far. `clearTelemetry` discards what has arrived.
`receiverAddress` returns the `httpEndpoint` and `grpcEndpoint` of the receiver.

Attributes become plain objects such as `{ "order.id": "o-1" }`. IDs become hex
strings. Spans and logs carry `resource` and `scope`. They hold the resource
attributes and the instrumentation scope.

## Environment

`OTEL_EXPORTER_OTLP_ENDPOINT` is the HTTP URL of the receiver. When
`OTEL_EXPORTER_OTLP_PROTOCOL` is `grpc`, it is the gRPC URL instead.
`OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER` and `OTEL_LOGS_EXPORTER` are
`otlp`.

Export delays are shortened, but only when they are unset.

| Variable                      | Value |
| ----------------------------- | ----- |
| `OTEL_BSP_SCHEDULE_DELAY`     | 50    |
| `OTEL_BLRP_SCHEDULE_DELAY`    | 50    |
| `OTEL_METRIC_EXPORT_INTERVAL` | 100   |
| `OTEL_METRIC_EXPORT_TIMEOUT`  | 100   |

The per-signal variables `OTEL_EXPORTER_OTLP_<SIGNAL>_ENDPOINT` are emptied.
Test telemetry therefore never leaks to an outside Collector.

The receiver closes when the test file ends. With `isolate: false`, files may
share one SDK. Then telemetry from the second file on is lost.

## Semantic conventions

`otlp({ semconv: true })` also checks every export against the OpenTelemetry
semantic conventions. It starts the live-check of
[OpenTelemetry Weaver](https://github.com/open-telemetry/weaver) once for the
run. Each receiver forwards what it gets to Weaver before storing it. When the
run ends, the plugin reads the report of Weaver. The run then fails and lists
every finding at or above `failOn`.

```ts
otlp({
  semconv: {
    registry: "https://github.com/open-telemetry/semantic-conventions.git@v1.45.0[model]",
    weaver: "weaver",
    failOn: "violation",
  },
});
```

The values above are the defaults. `failOn` is `violation`, `improvement` or
`information`. A custom attribute is a violation unless `registry` points to a
registry that defines it. The `weaver` binary must be on `PATH`. In GitHub
Actions, the
[setup-weaver](https://github.com/open-telemetry/weaver/tree/main/.github/actions/setup-weaver)
action installs it.

## Cloudflare Workers

Workers trace KV, D1, R2 and `fetch` calls without code changes, and hand the
spans and logs to a
[streaming tail worker](https://developers.cloudflare.com/workers/observability/logs/tail-workers/).
`tailWorker()` from `@r_masseater/vitest-otlp/workers` builds a tail worker for
[Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/). It
turns each invocation into OTLP and sends it to the receiver of the test file.

```ts
import { waitForSpans } from "@r_masseater/vitest-otlp";
import { tailWorker } from "@r_masseater/vitest-otlp/workers";
import { Effect } from "effect";
import { Miniflare } from "miniflare";

test("caching writes to KV", () =>
  Effect.gen(function* () {
    const tail = yield* tailWorker();
    const miniflare = new Miniflare({
      workers: [
        {
          name: "app",
          scriptPath: "worker.js",
          kvNamespaces: ["CACHE"],
          streamingTails: [tail.name],
        },
        tail,
      ],
    });
    yield* Effect.promise(() => miniflare.dispatchFetch("http://localhost/"));
    yield* waitForSpans({ where: (span) => span.name === "kv_put" });
    yield* Effect.promise(() => miniflare.dispose());
  }).pipe(Effect.runPromise));
```

The invocation becomes a server span named after its trigger, such as `fetch`.
Each traced call becomes a client span under it, and `console` calls become log
records in the same trace. The resource `service.name` is the script name of
the Worker. Miniflare reports no script name, so pass `serviceName` to
`tailWorker()` instead.

## License

MIT
