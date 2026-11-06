import { Array as Arr, Option, pipe } from "effect";
import { expect, test } from "vite-plus/test";

import { missingOf, render, spanOf, traceOf } from "./trace-tree.ts";

const event = (annotations: Readonly<Record<string, unknown>>): unknown => ({
  source: { message: "otlp.span", annotations },
});

const spans = pipe(
  [
    event({
      service: "web",
      traceId: "t1",
      spanId: "a",
      spanName: "GET /",
      attributes: { url: { full: "https://example.com/?workers-traces=1" } },
      startTimeUnixNano: "1000000000",
      endTimeUnixNano: "1012000000",
    }),
    event({
      traceId: "t1",
      spanId: "b",
      parentSpanId: "a",
      spanName: "d1_all",
      startTimeUnixNano: "1001000000",
      endTimeUnixNano: "1003000000",
    }),
    event({ traceId: "t2", spanId: "c", spanName: "GET /other" }),
    { source: { message: "something else" } },
  ],
  Arr.map((value) => spanOf(value)),
  Arr.getSomes,
);

test("only otlp.span events become spans", () => {
  expect(
    pipe(
      spans,
      Arr.map(({ spanId }) => spanId),
    ),
  ).toStrictEqual(["a", "b", "c"]);
  expect(spanOf({ source: "plain text" })).toStrictEqual(Option.none());
});

const sent = traceOf("https://example.com/?workers-traces=1")(spans);

test("a sent request selects only the trace it started", () => {
  expect(
    pipe(
      sent,
      Arr.map(({ spanId }) => spanId),
    ),
  ).toStrictEqual(["a", "b"]);
});

test("a trace renders as an indented tree with durations", () => {
  expect(render(sent)).toBe("trace t1 web\n  GET / (12 ms)\n    d1_all (2 ms)");
});

test("expected span names that never arrived are reported", () => {
  expect(missingOf(["GET /", "d1_all", "todo.list"])(sent)).toStrictEqual(["todo.list"]);
});
