# Measuring Web Vitals

`web-vitals-flow` drives Chrome with a
[Lighthouse user flow](https://github.com/GoogleChrome/lighthouse/blob/main/docs/user-flows.md).
For each URL it records a navigation. Then it goes back and records a timespan
for a click on each same-origin link of the page. Only a timespan measures INP
in Lighthouse, so INP comes from these link transitions.

```sh
vp dlx @r_masseater/web-vitals-flow https://example.com/
```

Measure the deployed production URL, in a job after the deployment.

The flow runs 5 times by default, and each step is judged by its median. This
follows the
[variability guidance](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md)
of Lighthouse. The CPU of CI runners varies widely, so one run is not a
measurement.

The command fails when LCP, INP or CLS of a step has a median score below 0.9.
That is the passing score of Lighthouse. FCP, TTFB and TBT are shown, but they
do not fail the command.

Each run writes `flow-<run>.html` and `flow-<run>.json` to `--report-dir`. The
default is `report`. Keep the reports as CI artifacts.

In a sandboxed container, pass Chrome flags such as
`--chrome-flags="--no-sandbox"`. Behind a proxy, also pass
`--proxy-server=$HTTPS_PROXY`. Set `CHROME_PATH` when Chrome is not found.

The command emits `web-vitals.flow`, `web-vitals.load`, `web-vitals.transition`
and `web-vitals.audit` spans. It does so when `OTEL_TRACES_EXPORTER=otlp` and an
endpoint are set.

Lab data does not replace field data. For what real visitors experience, use
the analytics of the platform that serves the page. Cloudflare Web Analytics is
one example.
