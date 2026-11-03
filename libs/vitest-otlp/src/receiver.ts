import {
  MockOtlpServer,
  normalizeLogs,
  normalizeMetrics,
  normalizeTrace,
} from "@elastic/mockotlpserver";
import type { Scope } from "effect";
import { Effect, MutableRef, Option, pipe } from "effect";

import type { ReceiverAddress } from "./telemetry.ts";

interface Requests {
  readonly traces: readonly unknown[];
  readonly logs: readonly unknown[];
  readonly metrics: readonly unknown[];
}

type SignalKey = keyof Requests;

interface Receiver {
  readonly address: ReceiverAddress;
  readonly requests: Effect.Effect<Requests>;
  readonly clear: Effect.Effect<void>;
}

const HOSTNAME = "127.0.0.1";
const ANY_FREE_PORT = 0;
const NOTHING_RECEIVED: Requests = { traces: [], logs: [], metrics: [] };

const origin = (url: Readonly<{ origin: string }> | null): string =>
  pipe(
    Option.fromNullishOr(url),
    Option.map((address) => address.origin),
    Option.getOrElse(() => ""),
  );

const startReceiver: Effect.Effect<Receiver, never, Scope.Scope> = Effect.gen(
  function* startReceiver() {
    const received = MutableRef.make(NOTHING_RECEIVED);
    const collect =
      (key: SignalKey, normalize: (request: unknown) => unknown) =>
      (request: unknown): void => {
        MutableRef.update(received, (requests) => ({
          ...requests,
          [key]: [...requests[key], normalize(request)],
        }));
      };
    const server = new MockOtlpServer({
      logLevel: "warn",
      services: ["http", "grpc"],
      httpHostname: HOSTNAME,
      httpPort: ANY_FREE_PORT,
      grpcHostname: HOSTNAME,
      grpcPort: ANY_FREE_PORT,
      onTrace: collect("traces", normalizeTrace),
      onLogs: collect("logs", normalizeLogs),
      onMetrics: collect("metrics", normalizeMetrics),
    });
    yield* Effect.acquireRelease(
      Effect.promise(() => server.start()),
      () => Effect.promise(() => server.close()),
    );
    return {
      address: { httpEndpoint: origin(server.httpUrl), grpcEndpoint: origin(server.grpcUrl) },
      requests: Effect.sync(() => MutableRef.get(received)),
      clear: Effect.sync(() => {
        MutableRef.set(received, NOTHING_RECEIVED);
      }),
    };
  },
).pipe(Effect.withSpan("vitest-otlp.receiver.start"));

export { startReceiver };
export type { Receiver, Requests, SignalKey };
