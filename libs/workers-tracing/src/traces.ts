import { CredentialsFromEnv } from "@distilled.cloud/cloudflare/Credentials";
import { queryObservabilityTelemetry } from "@distilled.cloud/cloudflare/workers";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import packageJson from "@r_masseater/workers-tracing/package.json" with { type: "json" };
import {
  Array as Arr,
  Clock,
  Config,
  Console,
  Duration,
  Effect,
  Layer,
  Option,
  Predicate,
  Schedule,
  Schema,
  pipe,
} from "effect";
import { Command, Flag } from "effect/cli";
import { FetchHttpClient, HttpClient } from "effect/http";

import { missingOf, render, spanOf, traceOf } from "./trace-tree.ts";
import type { ReceivedSpan } from "./trace-tree.ts";

const DEFAULT_SINK = "masseater-dev-trace-sink";
const DEFAULT_MINUTES = 15;
const DEFAULT_LIMIT = 500;
const DEFAULT_WAIT_SECONDS = 0;
const RETRY_SECONDS = 10;
const FEWEST_EXPECTED = 0;

const taggedError = Schema.TaggedError;

class MissingSpans extends taggedError<MissingSpans, { readonly brand: unique symbol }>()(
  "MissingSpans",
  { missing: Schema.Array(Schema.String), message: Schema.String },
) {}

type Query = Readonly<{
  account: string;
  sink: string;
  service: Option.Option<string>;
  minutes: number;
  limit: number;
}>;

const equals = (key: string, value: string) =>
  ({ key, operation: "eq", type: "string", value }) as const;

const query = Effect.fn("workers-traces.query")(function* query({
  account,
  sink,
  service,
  minutes,
  limit,
}: Query) {
  const to = yield* Clock.currentTimeMillis;
  const from = to - Duration.toMillis(Duration.minutes(minutes));
  const response = yield* queryObservabilityTelemetry({
    accountId: account,
    queryId: "workers-traces",
    timeframe: { from, to },
    view: "events",
    limit,
    parameters: {
      datasets: ["cloudflare-workers"],
      filterCombination: "and",
      filters: [
        equals("$metadata.service", sink),
        equals("$metadata.message", "otlp.span"),
        ...pipe(
          service,
          Option.map((name) => equals("service", name)),
          Option.toArray,
        ),
      ],
    },
  });
  return pipe(
    Option.fromNullishOr(response.events),
    Option.flatMapNullishOr(({ events }) => events),
    Option.getOrElse((): readonly unknown[] => []),
    Arr.map((event) => spanOf(event)),
    Arr.getSomes,
  );
});

type Select = (spans: readonly ReceivedSpan[]) => readonly ReceivedSpan[];

const MARKER = "workers-traces";

const send = Effect.fn("workers-traces.send")(function* send(url: string) {
  const marked = new URL(url);
  marked.searchParams.set(MARKER, (yield* Clock.currentTimeMillis).toString());
  yield* HttpClient.get(marked.href);
  return traceOf(marked.href);
});

const check = Effect.fn("workers-traces.check")(function* check(
  options: Query,
  expected: readonly string[],
  select: Select,
) {
  const spans = select(yield* query(options));
  const missing = missingOf(expected)(spans);
  if (Arr.isReadonlyArrayNonEmpty(missing)) {
    return yield* MissingSpans.make({
      missing,
      message: `Missing spans: ${Arr.join(missing, ", ")}`,
    });
  }
  return spans;
});

const retryInterval = Schedule.spaced(Duration.seconds(RETRY_SECONDS));

const retryFor = (seconds: number): Schedule.Schedule<number> =>
  retryInterval.pipe(Schedule.upTo({ duration: Duration.seconds(seconds) }));

const accountConfig = Config.String("CLOUDFLARE_ACCOUNT_ID");

const command = Command.make(
  "workers-traces",
  {
    account: Flag.String("account").pipe(
      Flag.withFallbackConfig(accountConfig),
      Flag.withDescription("Cloudflare account ID"),
    ),
    sink: Flag.String("sink").pipe(
      Flag.withDefault(DEFAULT_SINK),
      Flag.withDescription("Name of the Worker that logs the received spans as otlp.span"),
    ),
    service: Flag.String("service").pipe(
      Flag.optional,
      Flag.withDescription("Show only the spans of this Worker"),
    ),
    minutes: Flag.Int("minutes").pipe(
      Flag.withDefault(DEFAULT_MINUTES),
      Flag.withDescription("How far back to look"),
    ),
    limit: Flag.Int("limit").pipe(
      Flag.withDefault(DEFAULT_LIMIT),
      Flag.withDescription("Most spans to read"),
    ),
    request: Flag.String("request").pipe(
      Flag.optional,
      Flag.withDescription("Send a GET to this URL first and look only at the trace it starts"),
    ),
    expect: Flag.String("expect").pipe(
      Flag.between(FEWEST_EXPECTED, Number.POSITIVE_INFINITY),
      Flag.withDescription("Span name that must be present; fails when any is missing"),
    ),
    wait: Flag.Int("wait").pipe(
      Flag.withDefault(DEFAULT_WAIT_SECONDS),
      Flag.withDescription("Seconds to keep retrying until every expected span arrives"),
    ),
  },
  ({ expect, wait, request, ...options }) =>
    Effect.gen(function* run() {
      const select = yield* Option.match(request, {
        onNone: () => Effect.succeed<Select>((spans) => spans),
        onSome: send,
      });
      const spans = yield* check(options, expect, select).pipe(
        Effect.retry({ schedule: retryFor(wait), while: Predicate.isTagged("MissingSpans") }),
      );
      yield* Console.log(render(spans));
    }),
);

const services = Layer.mergeAll(CredentialsFromEnv, FetchHttpClient.layer, NodeServices.layer);

NodeRuntime.runMain(
  Layer.build(services).pipe(
    Effect.flatMap((context) =>
      Effect.provideContext(Command.run(command, { version: packageJson.version }), context),
    ),
    Effect.scoped,
  ),
);
