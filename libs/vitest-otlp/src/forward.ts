import { connect } from "node:http2";

import { Effect, MutableRef, Option, Schema } from "effect";

import { GrpcStatus, frame } from "./grpc.ts";
import type { Endpoint } from "./protocol.ts";

const taggedError = Schema.TaggedError;

class ForwardFailed extends taggedError<ForwardFailed, { readonly brand: unique symbol }>()(
  "ForwardFailed",
  { message: Schema.String },
) {}

const failure =
  (origin: string) =>
  (reason: string): ForwardFailed =>
    ForwardFailed.make({ message: `${origin}: ${reason}` });

const causedBy =
  (origin: string) =>
  (cause: unknown): ForwardFailed =>
    failure(origin)(String(cause));

const statusOf = (headers: Readonly<Record<string, unknown>>): Option.Option<string> =>
  Option.map(Option.fromNullishOr(headers["grpc-status"]), String);

const succeeded =
  (origin: string) =>
  (code: string): Effect.Effect<void, ForwardFailed> =>
    Effect.fromOption(Option.liftPredicate(code, (status) => status === GrpcStatus.ok)).pipe(
      Effect.asVoid,
      Effect.mapError(() => failure(origin)(`grpc-status ${code}`)),
    );

const outcome =
  (origin: string) =>
  (status: Option.Option<string>): Effect.Effect<void, ForwardFailed> =>
    Effect.fromOption(status).pipe(
      Effect.mapError(() => failure(origin)("no grpc-status")),
      Effect.flatMap(succeeded(origin)),
    );

const requestHeaders = (endpoint: Endpoint): Readonly<Record<string, string>> => ({
  ":method": "POST",
  ":path": endpoint.grpcPath,
  "content-type": "application/grpc",
  te: "trailers",
});

const exportTo =
  (origin: string, endpoint: Endpoint) =>
  (message: Uint8Array): Effect.Effect<void, ForwardFailed> =>
    Effect.acquireUseRelease(
      Effect.sync(() => connect(origin)),
      (session) =>
        Effect.callback<Option.Option<string>, ForwardFailed>((resume) => {
          const status = MutableRef.make(Option.none<string>());
          const remember = (headers: Readonly<Record<string, unknown>>): void => {
            MutableRef.update(
              status,
              Option.orElse(() => statusOf(headers)),
            );
          };
          const broken = (cause: unknown): void => {
            resume(Effect.fail(causedBy(origin)(cause)));
          };
          session.on("error", broken);
          session
            .request(requestHeaders(endpoint))
            .on("response", remember)
            .on("trailers", remember)
            .on("error", broken)
            .on("close", () => {
              resume(Effect.succeed(MutableRef.get(status)));
            })
            .resume()
            .end(frame(message));
        }).pipe(Effect.flatMap(outcome(origin))),
      (session) =>
        Effect.sync(() => {
          session.close();
        }),
    );

const forwardTo =
  (origins: readonly string[]) =>
  (endpoint: Endpoint) =>
  (message: Uint8Array): Effect.Effect<void, ForwardFailed> =>
    Effect.forEach(origins, (origin) => exportTo(origin, endpoint)(message), {
      discard: true,
    }).pipe(Effect.withSpan("vitest-otlp.forward"));

export { ForwardFailed, forwardTo };
