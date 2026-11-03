import type { Scope } from "effect";
import { Effect, MutableRef } from "effect";

import { serveGrpc } from "./grpc.ts";
import { serveHttp } from "./http.ts";
import type { Store } from "./protocol.ts";
import type { Requests } from "./requests.ts";
import type { ReceiverAddress } from "./telemetry.ts";

interface Receiver {
  readonly address: ReceiverAddress;
  readonly requests: Effect.Effect<Requests>;
  readonly clear: Effect.Effect<void>;
}

const NOTHING_RECEIVED: Requests = { traces: [], logs: [], metrics: [] };

const startReceiver: Effect.Effect<Receiver, never, Scope.Scope> = Effect.gen(
  function* startReceiver() {
    const received = MutableRef.make(NOTHING_RECEIVED);
    const store: Store = (endpoint) => (normalized) =>
      Effect.sync(() => {
        MutableRef.update(received, (requests) => ({
          ...requests,
          [endpoint.key]: [...requests[endpoint.key], normalized],
        }));
      });
    const httpEndpoint = yield* serveHttp(store);
    const grpcEndpoint = yield* serveGrpc(store);
    return {
      address: { httpEndpoint, grpcEndpoint },
      requests: Effect.sync(() => MutableRef.get(received)),
      clear: Effect.sync(() => {
        MutableRef.set(received, NOTHING_RECEIVED);
      }),
    };
  },
).pipe(Effect.withSpan("vitest-otlp.receiver.start"));

export { startReceiver };
export type { Receiver };
