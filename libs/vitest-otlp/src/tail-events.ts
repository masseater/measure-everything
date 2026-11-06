import type { TailStream } from "@cloudflare/workers-types/index.ts";
import { Array, Match, Option, Predicate, Record, Schema, pipe } from "effect";

import { SeverityNumber } from "./generated/opentelemetry/proto/logs/v1/logs_pb.ts";
import {
  Span_SpanKind,
  Status_StatusCode,
} from "./generated/opentelemetry/proto/trace/v1/trace_pb.ts";

type TailEvent = TailStream.TailEvent<TailStream.EventType>;
type Attribute = TailStream.Attribute;

interface Draft {
  readonly spanId: string;
  readonly parentSpanId: string;
  readonly name: string;
  readonly kind: Span_SpanKind;
  readonly start: bigint;
  readonly end: Option.Option<bigint>;
  readonly attributes: readonly TailStream.Attribute[];
  readonly status: Status_StatusCode;
}

interface LogDraft {
  readonly spanId: string;
  readonly time: bigint;
  readonly severity: SeverityNumber;
  readonly level: string;
  readonly body: string;
}

interface Invocation {
  readonly traceId: string;
  readonly serviceName: string;
  readonly spans: Readonly<Record<string, Draft>>;
  readonly logs: readonly LogDraft[];
}

const NANOS_PER_MILLI = 1_000_000n;

const SEVERITIES: Readonly<Record<TailStream.Log["level"], SeverityNumber>> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  log: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

const SPAN_STATUSES: Readonly<Record<TailStream.SpanStatusCode, Status_StatusCode>> = {
  unset: Status_StatusCode.UNSET,
  ok: Status_StatusCode.OK,
  error: Status_StatusCode.ERROR,
};

const nanos = (date: Date): bigint => BigInt(date.getTime()) * NANOS_PER_MILLI;

const statusOf = (
  outcome: TailStream.EventOutcome,
  current: Status_StatusCode,
): Status_StatusCode =>
  Match.value(outcome).pipe(
    Match.when("ok", () => current),
    Match.orElse(() => Status_StatusCode.ERROR),
  );

const onsetAttributes = (onset: TailStream.Onset): readonly Attribute[] => [
  ...(onset.attributes ?? []),
  ...Match.value(onset.info).pipe(
    Match.when({ type: "fetch" }, (info): readonly Attribute[] => [
      { name: "http.request.method", value: info.method },
      { name: "url.full", value: info.url },
    ]),
    Match.orElse((): readonly Attribute[] => []),
  ),
];

const encodeJsonText = Schema.encodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

const textOf = (part: unknown): string =>
  Match.value(part).pipe(
    Match.when(Predicate.isString, (text) => text),
    Match.orElse((other) =>
      pipe(
        encodeJsonText(other),
        Option.getOrElse(() => String(other)),
      ),
    ),
  );

const logBody = (message: object | string): string =>
  Match.value(message).pipe(
    Match.when(Array.isArray, (parts: readonly unknown[]) =>
      pipe(parts, Array.map(textOf), Array.join(" ")),
    ),
    Match.orElse(textOf),
  );

const exceptionAttributes = (exception: TailStream.Exception): readonly Attribute[] => [
  { name: "exception.type", value: exception.name },
  { name: "exception.message", value: exception.message },
  ...pipe(
    Option.fromNullishOr(exception.stack),
    Option.match({
      onNone: (): readonly Attribute[] => [],
      onSome: (stack): readonly Attribute[] => [{ name: "exception.stacktrace", value: stack }],
    }),
  ),
];

const returnAttributes = (info: TailStream.FetchResponseInfo | undefined): readonly Attribute[] =>
  pipe(
    Option.fromNullishOr(info),
    Option.match({
      onNone: (): readonly Attribute[] => [],
      onSome: ({ statusCode }): readonly Attribute[] => [
        { name: "http.response.status_code", value: statusCode },
      ],
    }),
  );

const updateSpan =
  (spanId: string, update: (draft: Draft) => Draft) =>
  (invocation: Invocation): Invocation => ({
    ...invocation,
    spans: Option.getOrElse(
      Record.modify(invocation.spans, spanId, update),
      () => invocation.spans,
    ),
  });

const addSpan =
  (draft: Draft) =>
  (invocation: Invocation): Invocation => ({
    ...invocation,
    spans: Record.set(invocation.spans, draft.spanId, draft),
  });

const withAttributes =
  (attributes: readonly Attribute[]) =>
  (draft: Draft): Draft => ({ ...draft, attributes: [...draft.attributes, ...attributes] });

const closed =
  (end: bigint, outcome: TailStream.EventOutcome) =>
  (draft: Draft): Draft => ({
    ...draft,
    end: Option.some(end),
    status: statusOf(outcome, draft.status),
  });

const updated =
  (info: TailStream.SpanUpdateInfo) =>
  (draft: Draft): Draft =>
    Match.value(info).pipe(
      Match.discriminatorsExhaustive("type")({
        name: ({ name }) => ({ ...draft, name }),
        status: ({ status }) => ({ ...draft, status: SPAN_STATUSES[status.code] }),
      }),
    );

type Opening = Pick<Draft, "spanId" | "name" | "kind">;

const opened = (tail: TailEvent, opening: Opening): Draft => ({
  ...opening,
  parentSpanId: tail.spanContext.spanId ?? "",
  start: nanos(tail.timestamp),
  end: Option.none(),
  attributes: [],
  status: Status_StatusCode.UNSET,
});

const onOnset = (invocation: Invocation, tail: TailEvent, onset: TailStream.Onset): Invocation => ({
  traceId: tail.spanContext.traceId,
  serviceName: onset.scriptName ?? invocation.serviceName,
  spans: {
    [onset.spanId]: {
      ...opened(tail, { spanId: onset.spanId, name: onset.info.type, kind: Span_SpanKind.SERVER }),
      attributes: onsetAttributes(onset),
    },
  },
  logs: [],
});

const onLog =
  (tail: TailEvent, log: TailStream.Log) =>
  (invocation: Invocation): Invocation => ({
    ...invocation,
    logs: [
      ...invocation.logs,
      {
        spanId: tail.spanContext.spanId ?? "",
        time: nanos(tail.timestamp),
        severity: SEVERITIES[log.level],
        level: log.level,
        body: logBody(log.message),
      },
    ],
  });

const step = (invocation: Invocation, tail: TailEvent): Invocation => {
  const own = tail.spanContext.spanId ?? "";
  const end = nanos(tail.timestamp);
  return Match.value(tail.event).pipe(
    Match.discriminatorsExhaustive("type")({
      onset: (onset) => onOnset(invocation, tail, onset),
      spanOpen: (open) =>
        addSpan(opened(tail, { spanId: open.spanId, name: open.name, kind: Span_SpanKind.CLIENT }))(
          invocation,
        ),
      attributes: ({ info }) => updateSpan(own, withAttributes(info))(invocation),
      spanClose: ({ outcome }) => updateSpan(own, closed(end, outcome))(invocation),
      outcome: ({ outcome }) => updateSpan(own, closed(end, outcome))(invocation),
      spanUpdate: ({ info }) => updateSpan(own, updated(info))(invocation),
      return: ({ info }) => updateSpan(own, withAttributes(returnAttributes(info)))(invocation),
      exception: (exception) =>
        updateSpan(own, withAttributes(exceptionAttributes(exception)))(invocation),
      log: (log) => onLog(tail, log)(invocation),
      diagnosticChannel: () => invocation,
      streamDiagnostic: () => invocation,
    }),
  );
};

const invocationOf =
  (serviceName: string) =>
  (events: readonly TailEvent[]): Invocation => {
    let invocation: Invocation = { traceId: "", serviceName, spans: {}, logs: [] };
    for (const tail of events) {
      invocation = step(invocation, tail);
    }
    return invocation;
  };

export { invocationOf };
export type { Draft, Invocation, LogDraft, TailEvent };
