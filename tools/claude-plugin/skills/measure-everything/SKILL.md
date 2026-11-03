---
name: measure-everything
description: Decide how to measure before building or fixing something. Use when adding traces, metrics or logs, checking that telemetry really leaves the process, measuring Web Vitals or page transitions, timing CI, or when about to write custom measurement code.
---

# measure-everything

## Why this skill exists and the state it aims for

This skill exists because an agent cannot see what its code does in production.
It fills the gap with guesses, and in the next step a guess looks the same as a
fact. Agents also tend to write their own timers, wrappers and log lines. Those
measure only what the author thought of. They drift from the code, and they
never reach the tools that people already read.

The state this skill aims for is that every decision rests on a measurement.
The measurement is taken where the software really runs. The official features
and auto-instrumentation of the tools in use collect it. So the measurement
keeps up with the code by itself.

## Rules

Measure before you implement or fix. First decide which measurement would
settle the question. Then run it, and judge only by its result.

Before you build a feature, make sure you can debug it yourself. You need a way
to reproduce it, logs or spans, and a path to read them.

Measure in production, or in a staging environment proven to match it. Numbers
from a local machine or a test alone are not grounds for a decision.

Make everything that spends time or money a span. That covers outbound requests,
model calls, child processes and file I/O. Put the span in the code that spends
the time. Do not wrap a command or a process only to time it.

Pick the means in this order.

1. The official feature or auto-instrumentation of the platform or library.
2. An existing tool that already does it.
3. A package from measure-everything, which only fills what the first two miss.
4. Your own code. Write in the commit message what you searched for and why it
   did not fit.

Configure exporters with the standard `OTEL_*` environment variables. Send only
when they are set, and never hard-code an endpoint.

When a test can check a measurement, write that test. Auto-instrumentation that
silently stops exporting is a regression.

## Which means to use

For traces, metrics and logs of a Node.js process, use
[OpenTelemetry zero-code instrumentation](https://opentelemetry.io/docs/zero-code/js/).
It is the `@opentelemetry/auto-instrumentations-node/register` preload,
configured with `OTEL_*`.

In Effect programs, use `Effect.fn` and `Effect.withSpan`. Export them with
`OtlpTracer.layerFromConfig` from `effect/observability`.

On Cloudflare Workers, turn on
[Workers tracing](https://developers.cloudflare.com/workers/observability/traces/)
with `observability.traces.enabled`. Export it to an OTLP destination.

To assert in a test that telemetry was really exported, use
[`@r_masseater/vitest-otlp`](https://github.com/masseater/measure-everything/tree/main/libs/vitest-otlp).

For Web Vitals of page loads and same-origin link transitions, use
[`@r_masseater/web-vitals-flow`](https://github.com/masseater/measure-everything/tree/main/libs/web-vitals-flow).
Read [web-vitals.md](references/web-vitals.md) before you run it.

For durations of GitHub Actions workflows, jobs and steps, use
[otel-cicd-action](https://github.com/corentinmusard/otel-cicd-action). Read
[ci.md](references/ci.md) before you add it.
