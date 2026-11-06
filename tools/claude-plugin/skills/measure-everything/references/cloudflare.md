# Measuring on Cloudflare

Turn on
[Workers
tracing](https://developers.cloudflare.com/workers/observability/traces/)
with `observability.traces.enabled`. Cloudflare then makes spans for outbound
fetches and for calls to KV, R2, D1, Durable Objects and other Workers. No SDK
is needed.

For an app on Effect, TanStack Start and Elysia, add
[`@r_masseater/workers-tracing`](https://github.com/masseater/measure-everything/tree/main/libs/workers-tracing).
Effect spans, requests, server functions and Elysia routes then join the
platform's own spans in one trace. Do not build an Effect tracer
or a span middleware per repository.

In an Alchemy stack, pass the providers through its `withWorkersTracing({
destinations })`. Do not write `observability` and a compatibility date on each
Worker. A Worker added later is then traced without anyone remembering to. Run
every Effect with its `run` or `runner`, and import `Elysia` from it. Add its
oxlint preset, so that code which skips tracing fails the lint.

To check spans in CI, deploy its `traceSink` once per account. Then run
`workers-traces --request <url> --expect <span> --wait <seconds>` after each
deploy. A span that stops arriving then fails the deploy job.

Send traces and logs to an OTLP backend through
[export
destinations](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data).
Make one destination per signal in the dashboard, and name it in the Worker
configuration. Export needs a paid Workers plan, and metrics cannot be exported
yet. Set `persist: false` to send without keeping a copy in the dashboard.

Read the timing of Workers spans with care. The runtime advances the clock only
on I/O, so some spans show a duration of zero. Calls through service bindings
and to Durable Objects start separate traces.

For D1, query the
[GraphQL Analytics
API](https://developers.cloudflare.com/d1/observability/metrics-analytics).
`d1QueriesAdaptiveGroups` lists queries with their time, rows read and rows
written. `wrangler d1 insights` ranks the same data from the command line. The
command is experimental, so its options may change.

For what real visitors experience, use Cloudflare Web Analytics.
