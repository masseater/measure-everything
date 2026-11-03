import type { DescMessage, JsonValue, Message } from "@bufbuild/protobuf";
import { create, fromBinary, fromJson, toBinary, toJson } from "@bufbuild/protobuf";
import { Effect, Option, Predicate, Schema } from "effect";

import {
  ExportLogsServiceRequestSchema,
  ExportLogsServiceResponseSchema,
} from "./generated/opentelemetry/proto/collector/logs/v1/logs_service_pb.ts";
import {
  ExportMetricsServiceRequestSchema,
  ExportMetricsServiceResponseSchema,
} from "./generated/opentelemetry/proto/collector/metrics/v1/metrics_service_pb.ts";
import {
  ExportTraceServiceRequestSchema,
  ExportTraceServiceResponseSchema,
} from "./generated/opentelemetry/proto/collector/trace/v1/trace_service_pb.ts";
import { hexIdsToBase64, normalize } from "./normalize.ts";
import type { SignalKey } from "./requests.ts";

const taggedError = Schema.TaggedError;

class MalformedExport extends taggedError<MalformedExport, { readonly brand: unique symbol }>()(
  "MalformedExport",
  { message: Schema.String },
) {}

interface Endpoint {
  readonly key: SignalKey;
  readonly httpPath: string;
  readonly grpcPath: string;
  readonly request: DescMessage;
  readonly response: DescMessage;
}

const ENDPOINTS: readonly Endpoint[] = [
  {
    key: "traces",
    httpPath: "/v1/traces",
    grpcPath: "/opentelemetry.proto.collector.trace.v1.TraceService/Export",
    request: ExportTraceServiceRequestSchema,
    response: ExportTraceServiceResponseSchema,
  },
  {
    key: "metrics",
    httpPath: "/v1/metrics",
    grpcPath: "/opentelemetry.proto.collector.metrics.v1.MetricsService/Export",
    request: ExportMetricsServiceRequestSchema,
    response: ExportMetricsServiceResponseSchema,
  },
  {
    key: "logs",
    httpPath: "/v1/logs",
    grpcPath: "/opentelemetry.proto.collector.logs.v1.LogsService/Export",
    request: ExportLogsServiceRequestSchema,
    response: ExportLogsServiceResponseSchema,
  },
];

const malformed = (cause: unknown): MalformedExport =>
  MalformedExport.make({ message: String(cause) });

const decodeJsonText = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.MutableJson));

const normalized =
  (endpoint: Endpoint) =>
  (read: () => Message): Effect.Effect<JsonValue, MalformedExport> =>
    Effect.try({ try: () => normalize(toJson(endpoint.request, read())), catch: malformed });

const fromProtobuf =
  (endpoint: Endpoint) =>
  (body: Uint8Array): Effect.Effect<JsonValue, MalformedExport> =>
    normalized(endpoint)(() => fromBinary(endpoint.request, body));

const fromOtlpJson =
  (endpoint: Endpoint) =>
  (body: Uint8Array): Effect.Effect<JsonValue, MalformedExport> =>
    decodeJsonText(new TextDecoder().decode(body)).pipe(
      Effect.mapError(malformed),
      Effect.flatMap((json) =>
        normalized(endpoint)(() =>
          fromJson(endpoint.request, hexIdsToBase64(json), { ignoreUnknownFields: true }),
        ),
      ),
    );

const gunzip = (body: Uint8Array): Effect.Effect<Uint8Array, MalformedExport> =>
  Effect.tryPromise({
    try: () =>
      new Response(
        new Blob([Uint8Array.from(body)]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).bytes(),
    catch: malformed,
  });

const gunzipWhen =
  (compressed: boolean) =>
  (body: Uint8Array): Effect.Effect<Uint8Array, MalformedExport> =>
    Option.match(
      Option.liftPredicate(body, () => compressed),
      {
        onSome: gunzip,
        onNone: () => Effect.succeed(body),
      },
    );

type Store = (endpoint: Endpoint) => (normalized: JsonValue) => Effect.Effect<void>;

const LOOPBACK = "127.0.0.1";

const originOf = (address: object): string =>
  Option.match(Option.liftPredicate(address, Predicate.hasProperty("port")), {
    onSome: ({ port }) => `http://${LOOPBACK}:${String(port)}`,
    onNone: () => "",
  });

const emptyResponse = (endpoint: Endpoint): Uint8Array =>
  toBinary(endpoint.response, create(endpoint.response));

export {
  ENDPOINTS,
  MalformedExport,
  emptyResponse,
  fromOtlpJson,
  fromProtobuf,
  gunzipWhen,
  originOf,
  LOOPBACK,
};
export type { Endpoint, Store };
