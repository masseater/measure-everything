import { create } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import type { TailStream } from "@cloudflare/workers-types/index.ts";
import { Array, Match, Option, Predicate, Record, Result, pipe } from "effect";
import { Hex } from "effect/encoding";

import type { ExportLogsServiceRequest } from "./generated/opentelemetry/proto/collector/logs/v1/logs_service_pb.ts";
import { ExportLogsServiceRequestSchema } from "./generated/opentelemetry/proto/collector/logs/v1/logs_service_pb.ts";
import type { ExportTraceServiceRequest } from "./generated/opentelemetry/proto/collector/trace/v1/trace_service_pb.ts";
import { ExportTraceServiceRequestSchema } from "./generated/opentelemetry/proto/collector/trace/v1/trace_service_pb.ts";
import type {
  AnyValueSchema,
  KeyValueSchema,
} from "./generated/opentelemetry/proto/common/v1/common_pb.ts";
import type { LogRecordSchema } from "./generated/opentelemetry/proto/logs/v1/logs_pb.ts";
import type { SpanSchema } from "./generated/opentelemetry/proto/trace/v1/trace_pb.ts";
import type { Draft, Invocation, LogDraft } from "./tail-events.ts";

type AnyValueInit = MessageInitShape<typeof AnyValueSchema>;
type KeyValueInit = MessageInitShape<typeof KeyValueSchema>;
type Attribute = TailStream.Attribute;
type Scalar = string | boolean | number | bigint;

const SCOPE_NAME = "cloudflare-workers";

const stringValue = (value: string): AnyValueInit => ({ value: { case: "stringValue", value } });
const boolValue = (value: boolean): AnyValueInit => ({ value: { case: "boolValue", value } });
const intValue = (value: bigint): AnyValueInit => ({ value: { case: "intValue", value } });
const doubleValue = (value: number): AnyValueInit => ({ value: { case: "doubleValue", value } });
const numberValue = (value: number): AnyValueInit =>
  Match.value(value).pipe(
    Match.when(
      (whole: number) => Number.isInteger(whole),
      (whole) => intValue(BigInt(whole)),
    ),
    Match.orElse(doubleValue),
  );

const scalarValue = (value: Scalar): AnyValueInit =>
  Match.value(value).pipe(
    Match.when(Predicate.isString, stringValue),
    Match.when(Predicate.isBoolean, boolValue),
    Match.when(Predicate.isBigInt, intValue),
    Match.orElse(numberValue),
  );

const arrayValue = (values: readonly Scalar[]): AnyValueInit => ({
  value: { case: "arrayValue", value: { values: pipe(values, Array.map(scalarValue)) } },
});

const anyValue = (attribute: Attribute): AnyValueInit =>
  Match.value(attribute.value).pipe(
    Match.when(Predicate.isString, stringValue),
    Match.when(Predicate.isBoolean, boolValue),
    Match.when(Predicate.isBigInt, intValue),
    Match.when(Predicate.isNumber, numberValue),
    Match.orElse(arrayValue),
  );

const keyValue = (attribute: Attribute): KeyValueInit => ({
  key: attribute.name,
  value: anyValue(attribute),
});

const idBytes = (hex: string): Uint8Array =>
  Result.getOrElse(Hex.decode(hex), () => new Uint8Array());

const spanInit =
  (traceId: string) =>
  (draft: Draft): MessageInitShape<typeof SpanSchema> => ({
    traceId: idBytes(traceId),
    spanId: idBytes(draft.spanId),
    parentSpanId: idBytes(draft.parentSpanId),
    name: draft.name,
    kind: draft.kind,
    startTimeUnixNano: draft.start,
    endTimeUnixNano: Option.getOrElse(draft.end, () => draft.start),
    attributes: pipe(draft.attributes, Array.map(keyValue)),
    status: { code: draft.status },
  });

const logInit =
  (traceId: string) =>
  (log: LogDraft): MessageInitShape<typeof LogRecordSchema> => ({
    timeUnixNano: log.time,
    severityNumber: log.severity,
    severityText: log.level,
    body: stringValue(log.body),
    traceId: idBytes(traceId),
    spanId: idBytes(log.spanId),
  });

const resourceOf = (invocation: Invocation): KeyValueInit[] => [
  keyValue({ name: "service.name", value: invocation.serviceName }),
];

const tracesOf = (invocation: Invocation): ExportTraceServiceRequest => {
  const spans = pipe(Record.values(invocation.spans), Array.map(spanInit(invocation.traceId)));
  return create(ExportTraceServiceRequestSchema, {
    resourceSpans: [
      {
        resource: { attributes: resourceOf(invocation) },
        scopeSpans: [{ scope: { name: SCOPE_NAME }, spans }],
      },
    ],
  });
};

const logsOf = (invocation: Invocation): ExportLogsServiceRequest => {
  const logRecords = pipe(invocation.logs, Array.map(logInit(invocation.traceId)));
  return create(ExportLogsServiceRequestSchema, {
    resourceLogs: [
      {
        resource: { attributes: resourceOf(invocation) },
        scopeLogs: [{ scope: { name: SCOPE_NAME }, logRecords }],
      },
    ],
  });
};

export { logsOf, tracesOf };
