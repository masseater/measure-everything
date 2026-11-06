# @r_masseater/workers-tracing

Adds the spans of Effect, TanStack Start and Elysia to the
[automatic traces of Cloudflare
Workers](https://developers.cloudflare.com/workers/observability/traces/).
They nest with the platform's own spans for D1, KV, R2 and outbound fetches.
One trace then shows the whole request.

It targets one stack only: Cloudflare Workers with Effect 4, TanStack Start 1
and Elysia 1. It uses
[custom spans](https://developers.cloudflare.com/workers/observability/traces/custom-spans/).
They need a compatibility date of 2026-07-28 or later.

## Alchemy

`withWorkersTracing` wraps the providers of an [Alchemy](https://alchemy.run)
stack. It changes every Worker the stack declares, including the ones a
`Website` creates. Logs and traces are turned on and kept. Traces also go to the
`masseater-dev-traces` destination. The compatibility date becomes 2026-08-25
if it was older. A Worker's own settings win where they ask for more. Versions
of another Worker are left alone.

```ts
import { withWorkersTracing } from "@r_masseater/workers-tracing/alchemy";

export default Stack(
  APP_NAME,
  { providers: withWorkersTracing(providers()), state: state() },
  stack,
);
```

## Effect

`layer` makes every `Effect.withSpan` and `Effect.fn` a Workers span, and makes
logs carry the span they were written in. Provide it once, for example to a
`ManagedRuntime` that lives as long as the Worker.

```ts
import { layer } from "@r_masseater/workers-tracing/effect";

const runtime = ManagedRuntime.make(Layer.mergeAll(appLayer, layer));
```

`runner` builds that runtime and returns a function that runs an Effect as a
Promise, logging the cause when it fails.

```ts
import { runner } from "@r_masseater/workers-tracing/effect";

const run = runner(appLayer);
```

A span follows the request that started its fiber, even when one runtime
serves many requests at once. A failure marks the span as an error and records
the exception.

## TanStack Start

`requestSpan` makes each request a span named after its method and path.
`serverFnSpan` makes each server function call a span named after the function.
This includes calls made during server rendering.

```ts
import { requestSpan, serverFnSpan } from "@r_masseater/workers-tracing/tanstack-start";

const startInstance = createStart(() => ({
  requestMiddleware: [requestSpan],
  functionMiddleware: [serverFnSpan],
}));
```

## Elysia

`tracedHandle` makes each call of `handle` a span. The `elysiaTracing` plugin
renames it after the matched route, such as `GET /items/:id`, and records
errors. Wrap every `handle` you call, including the one server rendering calls
directly.

```ts
import { elysiaTracing, tracedHandle } from "@r_masseater/workers-tracing/elysia";

const traced = new Elysia({ adapter: CloudflareAdapter }).use(elysiaTracing);
const api = traced.get("/items/:id", item);
const handle = tracedHandle(api.handle);
```

An API route that hands requests to Elysia can use `routeHandlers`. The request
may already have a span from `requestSpan`. The Elysia route then reuses it, so
the request does not get a second span.

```ts
import { routeHandlers } from "@r_masseater/workers-tracing/elysia";

export const Route = createFileRoute("/api/$")({
  server: { handlers: routeHandlers(api.handle) },
});
```

## Checking the spans

The `masseater-dev-traces` destination sends every span to a Worker that logs
each one as `otlp.span`. `workers-traces` reads those logs back through the
Workers Observability API. It prints each trace as a tree with durations. It
reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

```sh
workers-traces --service my-worker --minutes 30
```

With `--expect`, it fails unless every named span arrived. `--wait` keeps
asking until they do. `--request` sends a GET to a URL first and looks only at
the trace that request started. A deploy job can then check its own request.

```sh
workers-traces --request https://example.com/ \
  --expect "GET /" --expect d1_all --wait 120
```

## Cost

Measured in Miniflare (workerd 1.20261104.1) on 2026-11-05, as the median of
500 requests, with and without `layer`.

| Request              | Without    | With         | Added             |
| -------------------- | ---------- | ------------ | ----------------- |
| 3 spans, 30 steps    | 3.4 ms     | 3.1–3.7 ms   | noise             |
| 1 span, 10,000 steps | 10.1 ms    | 16.2–16.8 ms | 0.6 µs per step   |
| 200 Effect spans     | 3.9–5.0 ms | 9.9–13.1 ms  | 25–45 µs per span |

200 plain Workers spans cost 3.5 to 4 ms, so the platform takes about 20 µs of
each span. The rest comes from running each Effect step in the request's
context. Keep heavy loops out of Effect if they run many thousand steps.

## License

MIT
