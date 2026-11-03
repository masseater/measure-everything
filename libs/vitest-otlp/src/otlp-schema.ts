import { Array, Effect, Option, Schema, pipe } from "effect";

import type {
  Attributes,
  InstrumentationScope,
  ReceivedLogRecord,
  ReceivedMetric,
  ReceivedSpan,
} from "./telemetry.ts";

const orEmpty = <Self extends Schema.Top>(
  schema: Self,
  empty: Self["Encoded"],
): Schema.withDecodingDefault<Self> =>
  schema.pipe(Schema.withDecodingDefault(Effect.succeed(empty)));

const AttributesSchema = Schema.Record(Schema.String, Schema.Unknown);

const OptionalString = Schema.optionalKey(Schema.String);

const ResourceSchema = orEmpty(Schema.Struct({ attributes: orEmpty(AttributesSchema, {}) }), {});

const ScopeSchema = orEmpty(
  Schema.Struct({
    name: orEmpty(Schema.String, ""),
    version: OptionalString,
    attributes: Schema.optionalKey(AttributesSchema),
  }),
  {},
);

const UnknownArray = orEmpty(Schema.Array(Schema.Unknown), []);

const StatusSchema = Schema.Struct({ code: OptionalString, message: OptionalString });

const SpanSchema = Schema.Struct({
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: OptionalString,
  name: Schema.String,
  kind: orEmpty(Schema.String, "SPAN_KIND_UNSPECIFIED"),
  startTimeUnixNano: orEmpty(Schema.String, "0"),
  endTimeUnixNano: orEmpty(Schema.String, "0"),
  attributes: orEmpty(AttributesSchema, {}),
  events: UnknownArray,
  links: UnknownArray,
  status: orEmpty(StatusSchema, {}),
});

const LogRecordSchema = Schema.Struct({
  timeUnixNano: OptionalString,
  observedTimeUnixNano: OptionalString,
  severityNumber: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.String])),
  severityText: OptionalString,
  body: Schema.optionalKey(Schema.Unknown),
  attributes: orEmpty(AttributesSchema, {}),
  traceId: OptionalString,
  spanId: OptionalString,
});

const DataSchema = Schema.optionalKey(Schema.Struct({ dataPoints: UnknownArray }));

const MetricSchema = Schema.Struct({
  name: Schema.String,
  description: OptionalString,
  unit: OptionalString,
  sum: DataSchema,
  gauge: DataSchema,
  histogram: DataSchema,
  exponentialHistogram: DataSchema,
  summary: DataSchema,
});

const ScopeSpansSchema = Schema.Struct({
  scope: ScopeSchema,
  spans: orEmpty(Schema.Array(SpanSchema), []),
});
const ResourceSpansSchema = Schema.Struct({
  resource: ResourceSchema,
  scopeSpans: orEmpty(Schema.Array(ScopeSpansSchema), []),
});
const TraceRequestSchema = Schema.Struct({
  resourceSpans: orEmpty(Schema.Array(ResourceSpansSchema), []),
});

const ScopeLogsSchema = Schema.Struct({
  scope: ScopeSchema,
  logRecords: orEmpty(Schema.Array(LogRecordSchema), []),
});
const ResourceLogsSchema = Schema.Struct({
  resource: ResourceSchema,
  scopeLogs: orEmpty(Schema.Array(ScopeLogsSchema), []),
});
const LogsRequestSchema = Schema.Struct({
  resourceLogs: orEmpty(Schema.Array(ResourceLogsSchema), []),
});

const ScopeMetricsSchema = Schema.Struct({
  scope: ScopeSchema,
  metrics: orEmpty(Schema.Array(MetricSchema), []),
});
const ResourceMetricsSchema = Schema.Struct({
  resource: ResourceSchema,
  scopeMetrics: orEmpty(Schema.Array(ScopeMetricsSchema), []),
});
const MetricsRequestSchema = Schema.Struct({
  resourceMetrics: orEmpty(Schema.Array(ResourceMetricsSchema), []),
});

interface Context {
  readonly resource: Attributes;
  readonly scope: InstrumentationScope;
}

const METRIC_TYPES = ["sum", "gauge", "histogram", "exponentialHistogram", "summary"] as const;

const toMetric =
  (context: Context) =>
  ({
    sum,
    gauge,
    histogram,
    exponentialHistogram,
    summary,
    ...metric
  }: typeof MetricSchema.Type): ReceivedMetric => {
    const data = { sum, gauge, histogram, exponentialHistogram, summary };
    const found = pipe(
      METRIC_TYPES,
      Array.findFirst((type) =>
        pipe(
          Option.fromNullishOr(data[type]),
          Option.map(({ dataPoints }) => ({ type, dataPoints })),
        ),
      ),
    );
    return {
      ...metric,
      ...Option.getOrElse(found, () => ({ type: "unknown", dataPoints: [] })),
      ...context,
    };
  };

const spansOf = ({
  resource,
  scopeSpans,
}: typeof ResourceSpansSchema.Type): readonly ReceivedSpan[] =>
  pipe(
    scopeSpans,
    Array.flatMap(({ scope, spans }) =>
      pipe(
        spans,
        Array.map((span) => ({ ...span, resource: resource.attributes, scope })),
      ),
    ),
  );

const logsOf = ({
  resource,
  scopeLogs,
}: typeof ResourceLogsSchema.Type): readonly ReceivedLogRecord[] =>
  pipe(
    scopeLogs,
    Array.flatMap(({ scope, logRecords }) =>
      pipe(
        logRecords,
        Array.map((logRecord) => ({ ...logRecord, resource: resource.attributes, scope })),
      ),
    ),
  );

const metricsOf = ({
  resource,
  scopeMetrics,
}: typeof ResourceMetricsSchema.Type): readonly ReceivedMetric[] =>
  pipe(
    scopeMetrics,
    Array.flatMap(({ scope, metrics }) =>
      pipe(metrics, Array.map(toMetric({ resource: resource.attributes, scope }))),
    ),
  );

const decodeSpans = (
  normalized: unknown,
): Effect.Effect<readonly ReceivedSpan[], Schema.SchemaError> =>
  Schema.decodeUnknownEffect(TraceRequestSchema)(normalized).pipe(
    Effect.map(({ resourceSpans }) => pipe(resourceSpans, Array.flatMap(spansOf))),
  );

const decodeLogs = (
  normalized: unknown,
): Effect.Effect<readonly ReceivedLogRecord[], Schema.SchemaError> =>
  Schema.decodeUnknownEffect(LogsRequestSchema)(normalized).pipe(
    Effect.map(({ resourceLogs }) => pipe(resourceLogs, Array.flatMap(logsOf))),
  );

const decodeMetrics = (
  normalized: unknown,
): Effect.Effect<readonly ReceivedMetric[], Schema.SchemaError> =>
  Schema.decodeUnknownEffect(MetricsRequestSchema)(normalized).pipe(
    Effect.map(({ resourceMetrics }) => pipe(resourceMetrics, Array.flatMap(metricsOf))),
  );

export { decodeLogs, decodeMetrics, decodeSpans };
