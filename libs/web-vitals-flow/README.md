# @r_masseater/web-vitals-flow

Measures Web Vitals of page loads and same-origin link transitions with
[Lighthouse user
flows](https://github.com/GoogleChrome/lighthouse/blob/main/docs/user-flows.md).
It reports LCP, INP and CLS. It also reports FCP, TTFB and TBT. It fails when
LCP, INP or CLS of
any step misses the passing score of Lighthouse.

It requires Node.js 26 or later and Chrome.

```sh
vp dlx @r_masseater/web-vitals-flow https://example.com/
```

For each URL it records a navigation. Then it records a timespan for a click on
each same-origin link of that page. INP comes from these transitions.

The flow runs 5 times, and each step is judged by its median. This follows the
[variability
guidance](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md)
of Lighthouse. `--runs` changes the count. A step fails when the median score
of LCP, INP or CLS is below 0.9.

Each run writes `flow-<run>.html` and `flow-<run>.json` to `--report-dir`. The
default is `report`.

`--chrome-flags` passes space-separated flags to Chrome. In a container, pass
`--chrome-flags="--no-sandbox"`. Set `CHROME_PATH` when Chrome is not found.

When `OTEL_TRACES_EXPORTER=otlp` and `OTEL_EXPORTER_OTLP_ENDPOINT` are set, it
exports spans. They are `web-vitals.flow`, `web-vitals.load`,
`web-vitals.transition` and `web-vitals.audit`.

## License

MIT
