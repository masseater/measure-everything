import { createServer } from "node:http2";

import { NodeHttpServer, NodeHttpServerRequest } from "@effect/platform-node";
import type { Scope } from "effect";
import { Array, Effect, Option } from "effect";
import type { HttpServerError } from "effect/http";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import type { Endpoint, MalformedExport, Store } from "./protocol.ts";
import {
  ENDPOINTS,
  emptyResponse,
  fromProtobuf,
  gunzipWhen,
  LOOPBACK,
  originOf,
} from "./protocol.ts";

const FRAME_HEADER_BYTES = 5;
const LENGTH_OFFSET = 1;
const COMPRESSED_FLAG = 1;
const FIRST_BYTE = 0;
const ANY_FREE_PORT = 0;

const GrpcStatus = {
  ok: "0",
  invalidArgument: "3",
  unimplemented: "12",
  unavailable: "14",
} as const;

const frame = (message: Uint8Array): Uint8Array => {
  const framed = new Uint8Array(FRAME_HEADER_BYTES + message.length);
  new DataView(framed.buffer).setUint32(LENGTH_OFFSET, message.length);
  framed.set(message, FRAME_HEADER_BYTES);
  return framed;
};

const unframe =
  (request: HttpServerRequest.HttpServerRequest) =>
  (framed: Uint8Array): Effect.Effect<Uint8Array, MalformedExport> =>
    gunzipWhen(
      framed[FIRST_BYTE] === COMPRESSED_FLAG && request.headers["grpc-encoding"] === "gzip",
    )(framed.subarray(FRAME_HEADER_BYTES));

const reply =
  (request: HttpServerRequest.HttpServerRequest) =>
  (status: string, message: Uint8Array): HttpServerResponse.HttpServerResponse => {
    NodeHttpServerRequest.toServerResponse(request).addTrailers({ "grpc-status": status });
    return HttpServerResponse.uint8Array(message, { contentType: "application/grpc" });
  };

const rejected =
  (request: HttpServerRequest.HttpServerRequest, status: string) =>
  (): HttpServerResponse.HttpServerResponse =>
    reply(request)(status, new Uint8Array());

const accepted =
  (request: HttpServerRequest.HttpServerRequest, endpoint: Endpoint) =>
  (): HttpServerResponse.HttpServerResponse =>
    reply(request)(GrpcStatus.ok, frame(emptyResponse(endpoint)));

const receive =
  (store: Store, request: HttpServerRequest.HttpServerRequest) =>
  (
    endpoint: Endpoint,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, HttpServerError.HttpServerError> =>
    request.arrayBuffer.pipe(
      Effect.map((buffer) => new Uint8Array(buffer)),
      Effect.flatMap(unframe(request)),
      Effect.flatMap(fromProtobuf(endpoint)),
      Effect.flatMap(store(endpoint)),
      Effect.map(accepted(request, endpoint)),
      Effect.catchTags({
        MalformedExport: () => Effect.sync(rejected(request, GrpcStatus.invalidArgument)),
        ForwardFailed: () => Effect.sync(rejected(request, GrpcStatus.unavailable)),
      }),
    );

const exportCall = (
  store: Store,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError,
  HttpServerRequest.HttpServerRequest
> =>
  HttpServerRequest.HttpServerRequest.pipe(
    Effect.flatMap((request) =>
      Option.match(
        Array.findFirst(ENDPOINTS, ({ grpcPath }) => grpcPath === request.url),
        {
          onNone: () =>
            Effect.sync(() => reply(request)(GrpcStatus.unimplemented, new Uint8Array())),
          onSome: receive(store, request),
        },
      ),
    ),
  );

const serveGrpc = (store: Store): Effect.Effect<string, never, Scope.Scope> =>
  NodeHttpServer.make(() => createServer(), { port: ANY_FREE_PORT, host: LOOPBACK }).pipe(
    Effect.orDie,
    Effect.tap((server) => server.serve(exportCall(store))),
    Effect.map((server) => originOf(server.address)),
  );

export { GrpcStatus, frame, serveGrpc };
