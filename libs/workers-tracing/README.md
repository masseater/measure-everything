# @r_masseater/workers-tracing

Cloudflare Workers already traces each request on its own. It records a span for
every call to D1, KV, R2, Durable Objects and `fetch`. What it cannot see is
your code. It does not know which route ran or which server function was called,
nor which step of an Effect program took the time. This package puts those steps
into the same trace, nested above the platform's spans.

```text
GET (736 ms)                         ← Cloudflare: the request
  GET / (362 ms)                     ← TanStack Start: the page
    serverFn getInvite (361 ms)      ← TanStack Start: a server function
      invite.load (360 ms)           ← Effect.withSpan / Effect.fn
        d1_all (361 ms)              ← Cloudflare: the D1 query
```

It is designed so that tracing is hard to forget. You set it up once per app, in
the places below. After that, every Worker, route, server function and Effect
span is traced without anyone adding code for it. A lint preset flags the calls
that would skip tracing, and a CLI fails CI when an expected span stops
arriving.

## Requirements

- A Workers Paid plan. Traces are only kept there.
- [Effect](https://effect.website) 4. Every part of the package uses it.
- For each part, the library it is for: [Alchemy](https://alchemy.run) 2,
  [TanStack Start](https://tanstack.com/start) 1 or
  [Elysia](https://elysiajs.com) 1. Use only the parts for the libraries you
  have. An Elysia Worker deployed without Alchemy, for example, uses step 3. Its
  own Wrangler config then turns on `observability.traces` and sets a
  compatibility date of 2026-08-25 or later, the first date with custom spans.
- Node.js 26 or later.

No compatibility flag is needed.

```sh
vp add @r_masseater/workers-tracing
```

## Setup

### 1. Turn tracing on for every Worker of the stack

In your Alchemy stack file, usually `alchemy.run.ts`, pass the providers through
`withWorkersTracing`. Every Worker the stack declares then has logs and traces
turned on. That includes Workers made for you by `Website` and the other
helpers. Workers with no compatibility date, or one older than 2026-08-25, get
that date.

If you will check spans in CI (step 4), deploy the trace sink first and name its
destination here, as step 4 shows.

```ts
import { providers, state } from "@alchemy.run/cloudflare";
import { withWorkersTracing } from "@r_masseater/workers-tracing/alchemy";
import { Stack } from "alchemy";

export default Stack(
  "my-app",
  { providers: withWorkersTracing()(providers()), state: state() },
  app, // your stack's program, unchanged
);
```

A Worker keeps what it sets itself. That covers its log settings,
`traces.persist`, extra trace destinations and a later compatibility date. Two
kinds of Worker are left as they are. One is a Worker that sets
`observability.traces.enabled: false`, which is how a Worker opts out. The other
is a version uploaded to another Worker (`version.parent`).

### 2. Trace pages and server functions

Add the two middlewares in `src/start.ts`. Each request becomes a span named
after its method and path, such as `GET /items/42`. Each server function call
becomes a span named `serverFn` and the function's name, such as `serverFn
getInvite`. That includes calls made while rendering on the server.

```ts
import { requestSpan, serverFnSpan } from "@r_masseater/workers-tracing/tanstack-start";
import { createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => ({
  requestMiddleware: [requestSpan],
  functionMiddleware: [serverFnSpan],
}));
```

In the browser bundle, both middlewares do nothing.

### 3. Run Effects and Elysia through the package

Run every Effect with `run`, at the place where your code turns it into a
Promise. That is usually inside a server function, an Elysia handler or the
Worker's `fetch`. When your Effects need services, make a runner from your layer
once, at module scope, and run them with it. Every `Effect.withSpan` and
`Effect.fn` then becomes a Workers span under the request that started it. Logs
carry the span they were written in, so the dashboard shows them together.

```ts
import { run, runner } from "@r_masseater/workers-tracing/effect";

await run(loadInvite(id));

const runWithDb = runner(DatabaseLive);
await runWithDb(saveItem(item));
```

Both return a Promise that rejects when the Effect fails. Before rejecting, they
log `request failed` with the cause, so the failure is in the trace. The tracer
and logger of the package replace any your layer provides. In the browser and in
plain Node.js, they run the Effect without tracing.

Import `Elysia` from this package instead of from `elysia`. It is the same
class, so the rest of your code does not change. The difference is that each
request it handles becomes a span named after the matched route, such as `GET
/items/:id`. An error marks the span as failed. That holds for `handle` and for
`fetch`, so it also covers a compiled app that the Worker exports. Requests that
match no route keep their path as the name.

```ts
import { Elysia } from "@r_masseater/workers-tracing/elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";

export default new Elysia({ adapter: CloudflareAdapter }).get("/items/:id", item).compile();
```

A TanStack Start route can hand its requests to an Elysia app with
`routeHandlers`. It answers every method with the app's `handle`.

```ts
import { routeHandlers } from "@r_masseater/workers-tracing/elysia";

export const Route = createFileRoute("/api/$")({
  server: { handlers: routeHandlers(api.handle) },
});
```

A TanStack Start route may also pass its `request` on to `handle` itself. The
route's span is then renamed, not nested under a second one. That needs the same
`Request` object. A copy or a new `Request` gets its own span under the route's.

Add the lint preset to the `lint` section of your `vite.config.ts`. Then `vp
check` fails on the ways code could skip tracing. It flags `Effect.runPromise`,
`runSync` and the other run functions of Effect. It also flags
`ManagedRuntime.make` and importing `Elysia` from `elysia`, by name or as the
default import. A type import such as `import type { Elysia } from "elysia"`
stays allowed, for annotating an app's type.

```ts
import { restrictedImports, restrictedProperties } from "@r_masseater/workers-tracing/oxlint";
import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    rules: {
      "no-restricted-imports": ["error", { paths: restrictedImports }],
      "no-restricted-properties": ["error", ...restrictedProperties],
    },
  },
});
```

If your config already sets these two rules, add the entries to your own lists.

The entry points for Effect, Elysia and TanStack Start pick a build by export
condition. Bundlers for Workers set `workerd` and get the traced build. With
`browser` or `node`, you get a build that does not trace. Tests in plain Node.js
can therefore use `run` too, without a lint exception. A bundler that sets none
of these gets the traced build, which needs workerd.

### 4. Check in CI that the spans arrive

Cloudflare's API cannot return the spans of a trace. To read them back, deploy
`traceSink` once per Cloudflare account, as its own stack. It creates a Worker
named `workers-tracing-sink`. It also creates an [export
destination](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)
named `workers-tracing`, which sends the Worker a copy of every span. The Worker
writes each span to its own logs, where the API can read them. The Worker's URL
is public, but it drops any request that lacks the random token the destination
sends.

```ts
import { providers, state } from "@alchemy.run/cloudflare";
import { traceSink } from "@r_masseater/workers-tracing/alchemy";
import { Stack } from "alchemy";

export default Stack("trace-sink", { providers: providers(), state: state() }, traceSink());
```

Every app in the account can then use it. Name the destination in step 1. Deploy
the sink first, because the destination has to exist before a Worker names it.

```ts
withWorkersTracing({ destinations: ["workers-tracing"] })(providers());
```

Each span becomes one log event of the sink, billed as [Workers
Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#pricing).
`traceSink` takes `destination` to change the destination's name. The Worker is
then named after it, as `<destination>-sink`, unless you also pass `workerName`.
`logpush: true` also sends the sink's logs through Logpush.

After each deploy, run the CLI. It sends a GET request to the URL and waits up
to `--wait` seconds for its trace. Then it prints the trace as the tree at the
top. It fails unless every span named with `--expect` arrived. Without `--wait`
it looks only once, which is usually too soon.

```sh
vp exec workers-traces --request https://my-app.example.com/ \
  --expect "GET /" --expect d1_all --wait 300
```

It needs `CLOUDFLARE_API_TOKEN`, with Workers Observability read access, and
`CLOUDFLARE_ACCOUNT_ID` (or `--account`). It adds a `workers-traces` query
parameter to the URL, so each run finds the trace of its own request.

Without `--request` it prints the traces of the last 15 minutes. `--service
<worker>` narrows them to one Worker. `--minutes` changes the window, and
`--limit` the number of spans read, 500 by default. With `--request` it reads
only the spans that arrived after the request was sent. Other traffic on the
account then rarely pushes the request's trace out of the spans read. If it
still does, raise `--limit`. If the sink Worker has another name than
`workers-tracing-sink`, pass it with `--sink` or `WORKERS_TRACES_SINK`.

## How it works

Cloudflare offers [custom
spans](https://developers.cloudflare.com/workers/observability/traces/custom-spans/)
through `tracing.enterSpan` in `cloudflare:workers`. They nest by the async
context they run in, so a span started inside another becomes its child. The
platform's own D1 and KV spans then nest under it too.

Effect runs its own fibers, which do not follow that async context. The tracer
in `run` and `runner` starts a Workers span for each Effect span. It then runs
each step of the fiber inside the context of the request that started it. Spans
therefore stay with their request even when one runtime serves many requests at
once. A failed Effect marks its span as an error and records the exception.

## Cost

Measured in Miniflare (workerd 1.20261104.1) on 2026-11-05, as the median of 500
requests, with and without the tracer.

| Request              | Without    | With         | Added             |
| -------------------- | ---------- | ------------ | ----------------- |
| 3 spans, 30 steps    | 3.4 ms     | 3.1–3.7 ms   | noise             |
| 1 span, 10,000 steps | 10.1 ms    | 16.2–16.8 ms | 0.6 µs per step   |
| 200 Effect spans     | 3.9–5.0 ms | 9.9–13.1 ms  | 25–45 µs per span |

200 plain Workers spans cost 3.5 to 4 ms, so the platform takes about 20 µs of
each span. The rest comes from running each Effect step in the request's
context. Keep loops of many thousand steps out of Effect.

## License

MIT
