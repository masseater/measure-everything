import { toBinary } from "@bufbuild/protobuf";
import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import { Effect, ManagedRuntime } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import type { HttpClientError } from "effect/http";

import { ExportLogsServiceRequestSchema } from "./generated/opentelemetry/proto/collector/logs/v1/logs_service_pb.ts";
import { ExportTraceServiceRequestSchema } from "./generated/opentelemetry/proto/collector/trace/v1/trace_service_pb.ts";
import type { Invocation, TailEvent } from "./tail-events.ts";
import { invocationOf } from "./tail-events.ts";
import { logsOf, tracesOf } from "./tail-otlp.ts";

interface Env {
  readonly OTEL_EXPORTER_OTLP_ENDPOINT: string;
  readonly OTEL_SERVICE_NAME: string;
}

const PROTOBUF_CONTENT_TYPE = "application/x-protobuf";

const post = <Desc extends DescMessage>(
  url: string,
  schema: Desc,
  message: MessageShape<Desc>,
): Effect.Effect<unknown, HttpClientError.HttpClientError, HttpClient.HttpClient> => {
  const body = toBinary(schema, message);
  return HttpClient.execute(
    HttpClientRequest.post(url).pipe(HttpClientRequest.bodyUint8Array(body, PROTOBUF_CONTENT_TYPE)),
  );
};

const exportInvocation = (
  endpoint: string,
  invocation: Invocation,
): Effect.Effect<unknown, HttpClientError.HttpClientError, HttpClient.HttpClient> =>
  Effect.all(
    [
      post(`${endpoint}/v1/traces`, ExportTraceServiceRequestSchema, tracesOf(invocation)),
      post(`${endpoint}/v1/logs`, ExportLogsServiceRequestSchema, logsOf(invocation)),
    ],
    { concurrency: "unbounded" },
  );

const runtime = ManagedRuntime.make(FetchHttpClient.layer);

const tailStream = (onset: TailEvent, env: Env): ((event: TailEvent) => Promise<unknown>) => {
  const events: TailEvent[] = [onset];
  const exportAll = Effect.suspend(() =>
    exportInvocation(env.OTEL_EXPORTER_OTLP_ENDPOINT, invocationOf(env.OTEL_SERVICE_NAME)(events)),
  );
  return (event) => {
    events.push(event);
    return runtime.runPromise(
      Effect.when(exportAll, Effect.succeed(event.event.type === "outcome")),
    );
  };
};

const tailWorker = { tailStream };

export default tailWorker;
