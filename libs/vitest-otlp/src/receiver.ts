import type { JsonValue } from "@bufbuild/protobuf";
import type { Scope } from "effect";
import { Effect, MutableRef } from "effect";

import { forwardTo } from "./forward.ts";
import { serveGrpc } from "./grpc.ts";
import { serveHttp } from "./http.ts";
import type { Store } from "./protocol.ts";
import { encoded, normalized } from "./protocol.ts";
import type { Requests, SignalKey } from "./requests.ts";
import type { ReceiverAddress } from "./telemetry.ts";

interface Receiver {
  readonly address: ReceiverAddress;
  readonly requests: Effect.Effect<Requests>;
  readonly clear: Effect.Effect<void>;
}

const NOTHING_RECEIVED: Requests = { traces: [], logs: [], metrics: [] };

const startReceiver = (
  forwardOrigins: readonly string[],
): Effect.Effect<Receiver, never, Scope.Scope> =>
  Effect.gen(function* receiverStart() {
    const received = MutableRef.make(NOTHING_RECEIVED);
    const forward = forwardTo(forwardOrigins);
    const save =
      (key: SignalKey) =>
      (request: JsonValue): Effect.Effect<void> =>
        Effect.sync(() => {
          MutableRef.update(received, (requests) => ({
            ...requests,
            [key]: [...requests[key], request],
          }));
        });
    const store: Store = (endpoint) => (message) =>
      forward(endpoint)(encoded(endpoint)(message)).pipe(
        Effect.andThen(normalized(endpoint)(message)),
        Effect.flatMap(save(endpoint.key)),
      );
    const httpEndpoint = yield* serveHttp(store);
    const grpcEndpoint = yield* serveGrpc(store);
    return {
      address: { httpEndpoint, grpcEndpoint },
      requests: Effect.sync(() => MutableRef.get(received)),
      clear: Effect.sync(() => {
        MutableRef.set(received, NOTHING_RECEIVED);
      }),
    };
  }).pipe(Effect.withSpan("vitest-otlp.receiver.start"));

export { startReceiver };
export type { Receiver };
