# Measuring CI

Send every workflow as a trace with
[otel-cicd-action](https://github.com/corentinmusard/otel-cicd-action). Jobs
and steps become child spans. The action reads the run from the GitHub API
after the fact, so no step is wrapped.

Put it in a last job that `needs` every other job. Run that job with `always()`
so that failed and cancelled runs are measured too. Give it only `actions:
read`.

Pass the endpoint as the repository variable `OTEL_EXPORTER_OTLP_ENDPOINT`. Pass
the headers as the secret `OTEL_EXPORTER_OTLP_HEADERS`. Skip the job when the
variable is not set, so that forks and new repositories stay green. Pin the
action to a commit SHA. The example below pins v4.2.0.

```yaml
ci-telemetry:
  needs: [verify, deploy]
  if: always() && vars.OTEL_EXPORTER_OTLP_ENDPOINT != ''
  runs-on: ubuntu-latest
  permissions:
    actions: read
  steps:
    - uses: corentinmusard/otel-cicd-action@4826b79d63662fa91657272e7711420cb6aea543
      with:
        otlpEndpoint: ${{ vars.OTEL_EXPORTER_OTLP_ENDPOINT }}
        otlpHeaders: ${{ secrets.OTEL_EXPORTER_OTLP_HEADERS }}
        otelServiceName: ${{ github.repository }}
        githubToken: ${{ github.token }}
```

Some steps emit OpenTelemetry themselves, such as a test suite or
`web-vitals-flow`. Give them the same `OTEL_*` variables. Their spans then land
next to the workflow trace.
