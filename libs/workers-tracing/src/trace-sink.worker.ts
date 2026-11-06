import {
  Array as Arr,
  Effect,
  Logger,
  ManagedRuntime,
  Option,
  Record as Rec,
  Schema,
  pipe,
} from "effect";

type TraceSinkEnv = Readonly<{ TRACE_SINK_TOKEN: string }>;

const taggedError = Schema.TaggedError;

class UnreadableBody extends taggedError<UnreadableBody, { readonly brand: unique symbol }>()(
  "UnreadableBody",
  { message: Schema.String },
) {}

const KeyValue = Schema.Struct({
  key: Schema.String,
  value: Schema.Record(Schema.String, Schema.Unknown),
});

const Attributes = Schema.optional(Schema.Array(KeyValue));

const UnixNano = Schema.Union([Schema.String, Schema.Finite]);

const Span = Schema.Struct({
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: Schema.optional(Schema.String),
  name: Schema.String,
  startTimeUnixNano: Schema.optional(UnixNano),
  endTimeUnixNano: Schema.optional(UnixNano),
  attributes: Attributes,
});

const Scope = Schema.Struct({ name: Schema.optional(Schema.String) });

const ScopeSpans = Schema.Struct({
  scope: Schema.optional(Scope),
  spans: Schema.Array(Span),
});

const ResourceSpans = Schema.Struct({
  resource: Schema.optional(Schema.Struct({ attributes: Attributes })),
  scopeSpans: Schema.Array(ScopeSpans),
});

const TraceRequest = Schema.Struct({ resourceSpans: Schema.Array(ResourceSpans) });

type ReceivedSpan = Readonly<{
  service: unknown;
  scope: string | undefined;
  span: typeof Span.Type;
}>;

const runtime = ManagedRuntime.make(
  Logger.layer([Logger.withLeveledConsole(Logger.formatStructured)]),
);

const flatten = (attributes: typeof Attributes.Type): Readonly<Record<string, unknown>> =>
  Rec.fromEntries(
    pipe(
      attributes ?? [],
      Arr.map(
        ({ key, value }) => [key, Option.getOrUndefined(Arr.head(Rec.values(value)))] as const,
      ),
    ),
  );

const serviceOf = (resourceSpans: typeof ResourceSpans.Type): unknown =>
  pipe(
    Option.fromNullishOr(resourceSpans.resource),
    Option.map(({ attributes }) => flatten(attributes)["service.name"]),
    Option.getOrUndefined,
  );

const spansOf = (resourceSpans: typeof ResourceSpans.Type): readonly ReceivedSpan[] =>
  pipe(
    resourceSpans.scopeSpans,
    Arr.flatMap(({ scope, spans }) =>
      pipe(
        spans,
        Arr.map((span) => ({
          service: serviceOf(resourceSpans),
          scope: pipe(
            Option.fromNullishOr(scope),
            Option.flatMap(({ name }) => Option.fromNullishOr(name)),
            Option.getOrUndefined,
          ),
          span,
        })),
      ),
    ),
  );

const logSpan = ({ service, scope, span }: ReceivedSpan): Effect.Effect<void> =>
  Effect.logInfo("otlp.span").pipe(
    Effect.annotateLogs({
      service,
      scope,
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      spanName: span.name,
      startTimeUnixNano: span.startTimeUnixNano,
      endTimeUnixNano: span.endTimeUnixNano,
      attributes: flatten(span.attributes),
    }),
  );

const bodyOf = (request: Request): Promise<unknown> =>
  pipe(
    Option.fromNullishOr(request.body),
    Option.filter(() => request.headers.get("content-encoding") === "gzip"),
    Option.match({
      onNone: () => request.json(),
      onSome: (body) => new Response(body.pipeThrough(new DecompressionStream("gzip"))).json(),
    }),
  );

const receive = (request: Request, env: TraceSinkEnv): Effect.Effect<Response> =>
  Effect.gen(function* receiveTraces() {
    if (request.headers.get("authorization") !== `Bearer ${env.TRACE_SINK_TOKEN}`) {
      yield* Effect.logWarning("otlp.unauthorized");
      return Response.json({});
    }
    const body = yield* Effect.tryPromise({
      try: () => bodyOf(request),
      catch: (cause) => UnreadableBody.make({ message: String(cause) }),
    });
    const { resourceSpans } = yield* Schema.decodeUnknownEffect(TraceRequest)(body);
    yield* Effect.forEach(pipe(resourceSpans, Arr.flatMap(spansOf)), logSpan, { discard: true });
    return Response.json({});
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logError("otlp.rejected", cause).pipe(
        Effect.annotateLogs({ contentEncoding: request.headers.get("content-encoding") }),
        Effect.as(new Response("", { status: 400 })),
      ),
    ),
  );

const worker = {
  fetch: (request: Request, env: TraceSinkEnv): Promise<Response> =>
    runtime.runPromise(receive(request, env)),
};

export default worker;
