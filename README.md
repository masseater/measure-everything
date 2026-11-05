# measure-everything

In AI-era development, the most important thing is not implementation but
measurement. An agent can only fix what it can see. So everything it builds has
to be measurable where it really runs.

This repository collects what it takes to measure everything on top of the
existing ecosystem. The official features and auto-instrumentation of each
service and tool come first. A package is added here only where they fall
short. Each package plugs into OpenTelemetry or into an official extension point
of a tool. Nothing here is a measurement system of its own.

The method ships with the code. The `measure-everything` skill of the Claude
Code plugin tells an agent which means to use in which situation.

The stack is [Vite+](https://viteplus.dev/), which means Node.js. Only Node.js
26 and later are supported.

## Published

- npm: [@r_masseater/vitest-otlp](https://www.npmjs.com/package/@r_masseater/vitest-otlp)
- npm: [@r_masseater/web-vitals-flow](https://www.npmjs.com/package/@r_masseater/web-vitals-flow)
- npm: [@r_masseater/workers-tracing](https://www.npmjs.com/package/@r_masseater/workers-tracing)
- Claude Code plugin marketplace: `masseater/measure-everything`

## Packages

[@r_masseater/vitest-otlp](libs/vitest-otlp) receives OTLP inside Vitest. A
test can then assert the spans, metrics and logs that the code really exported.

[@r_masseater/web-vitals-flow](libs/web-vitals-flow) runs Lighthouse user flows.
It measures Web Vitals of page loads and of same-origin link transitions. Each
step is judged by the median of 5 runs.

[@r_masseater/workers-tracing](libs/workers-tracing) adds spans to the
automatic traces of Cloudflare Workers. It covers Effect spans, TanStack Start
requests and server functions, and Elysia routes.

CI durations need no package. The skill describes how to send them with the
existing [otel-cicd-action](https://github.com/corentinmusard/otel-cicd-action).

## Claude Code plugin

```sh
claude plugin marketplace add masseater/measure-everything
claude plugin install measure-everything@measure-everything
```

The plugin provides the
[`measure-everything` skill](tools/claude-plugin/skills/measure-everything/SKILL.md).

## License

MIT
