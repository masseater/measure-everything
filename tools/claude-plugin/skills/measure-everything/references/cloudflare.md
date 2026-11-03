# Measuring on Cloudflare

Turn on
[Workers
tracing](https://developers.cloudflare.com/workers/observability/traces/)
with `observability.traces.enabled`. Cloudflare then makes spans for outbound
fetches and for calls to KV, R2, D1, Durable Objects and other Workers. No SDK
is needed.

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
