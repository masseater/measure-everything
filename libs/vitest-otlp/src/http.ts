import type { Message } from "@bufbuild/protobuf";
import { NodeHttpServer } from "@effect/platform-node";
import type { Scope } from "effect";
import { Array, Context, Effect, Layer, Option, String, pipe } from "effect";
import type { HttpServerError } from "effect/http";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";

import type { Endpoint, MalformedExport, Store } from "./protocol.ts";
import {
  ENDPOINTS,
  emptyResponse,
  fromOtlpJson,
  fromProtobuf,
  gunzipWhen,
  originOf,
} from "./protocol.ts";

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;
const JSON_CONTENT_TYPE = "application/json";
const PROTOBUF_CONTENT_TYPE = "application/x-protobuf";

interface Encoding {
  readonly decode: (
    endpoint: Endpoint,
  ) => (body: Uint8Array) => Effect.Effect<Message, MalformedExport>;
  readonly respond: (endpoint: Endpoint) => HttpServerResponse.HttpServerResponse;
}

const JSON_ENCODING: Encoding = {
  decode: fromOtlpJson,
  respond: () => HttpServerResponse.text("{}", { contentType: JSON_CONTENT_TYPE }),
};

const PROTOBUF_ENCODING: Encoding = {
  decode: fromProtobuf,
  respond: (endpoint) =>
    HttpServerResponse.uint8Array(emptyResponse(endpoint), { contentType: PROTOBUF_CONTENT_TYPE }),
};

const headerStartsWith =
  (request: HttpServerRequest.HttpServerRequest, name: string) =>
  (expected: string): boolean =>
    pipe(Option.fromNullishOr(request.headers[name]), Option.exists(String.startsWith(expected)));

const encodingOf = (request: HttpServerRequest.HttpServerRequest): Encoding =>
  Option.match(
    Option.liftPredicate(JSON_ENCODING, () =>
      headerStartsWith(request, "content-type")(JSON_CONTENT_TYPE),
    ),
    { onSome: (json) => json, onNone: () => PROTOBUF_ENCODING },
  );

const receive =
  (store: Store, request: HttpServerRequest.HttpServerRequest) =>
  (
    endpoint: Endpoint,
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, HttpServerError.HttpServerError> =>
    Effect.gen(function* receiveExport() {
      const encoding = encodingOf(request);
      const buffer = yield* request.arrayBuffer;
      const raw = new Uint8Array(buffer);
      const body = yield* gunzipWhen(headerStartsWith(request, "content-encoding")("gzip"))(raw);
      const decoded = yield* encoding.decode(endpoint)(body);
      yield* store(endpoint)(decoded);
      return encoding.respond(endpoint);
    }).pipe(
      Effect.catchTags({
        MalformedExport: (malformed) =>
          Effect.succeed(HttpServerResponse.text(malformed.message, { status: HTTP_BAD_REQUEST })),
        ForwardFailed: (unforwarded) =>
          Effect.succeed(
            HttpServerResponse.text(unforwarded.message, { status: HTTP_SERVICE_UNAVAILABLE }),
          ),
      }),
    );

const exportRequest = (
  store: Store,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError,
  HttpServerRequest.HttpServerRequest
> =>
  HttpServerRequest.HttpServerRequest.pipe(
    Effect.flatMap((request) =>
      Option.match(
        Array.findFirst(ENDPOINTS, ({ httpPath }) => httpPath === request.url),
        {
          onNone: () => Effect.succeed(HttpServerResponse.empty({ status: HTTP_NOT_FOUND })),
          onSome: receive(store, request),
        },
      ),
    ),
  );

const serveHttp = (store: Store): Effect.Effect<string, never, Scope.Scope> =>
  Layer.build(NodeHttpServer.layerTest).pipe(
    Effect.orDie,
    Effect.map(Context.get(HttpServer.HttpServer)),
    Effect.tap((server) => server.serve(exportRequest(store))),
    Effect.map((server) => originOf(server.address)),
  );

export { serveHttp };
