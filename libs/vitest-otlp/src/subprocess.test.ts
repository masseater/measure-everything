import { NodeServices } from "@effect/platform-node";
import type { PlatformError } from "effect";
import { Effect, ManagedRuntime } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { afterAll, expect, test } from "vite-plus/test";

import type { ReadError, ReceivedSpan, TelemetryNotReceived } from "./index.ts";
import { receiverAddress, waitForSpans } from "./index.ts";

const services = ManagedRuntime.make(NodeServices.layer);
afterAll(() => services.dispose());

const childScript = (serviceName: string): string => `
  const { trace } = require("@opentelemetry/api");
  const { NodeSDK } = require("@opentelemetry/sdk-node");
  const sdk = new NodeSDK({ serviceName: ${JSON.stringify(serviceName)} });
  sdk.start();
  trace.getTracer("child").startSpan("child work").end();
  sdk.shutdown();
`;

const runChild = (
  serviceName: string,
  env: Readonly<Record<string, string>> = {},
): Effect.Effect<
  ChildProcessSpawner.ExitCode,
  PlatformError.PlatformError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  ChildProcessSpawner.ChildProcessSpawner.pipe(
    Effect.flatMap((spawner) =>
      spawner.exitCode(
        ChildProcess.make(process.execPath, ["-e", childScript(serviceName)], {
          env,
          extendEnv: true,
        }),
      ),
    ),
  );

const fromService = (
  serviceName: string,
): Effect.Effect<readonly ReceivedSpan[], TelemetryNotReceived | ReadError> =>
  waitForSpans({ where: (span) => span.resource["service.name"] === serviceName });

test("a child process inherits the receiver through the environment", () =>
  Effect.gen(function* inherited() {
    yield* runChild("child-http");
    expect(yield* fromService("child-http")).toMatchObject([{ name: "child work" }]);
  }).pipe(services.runPromise));

test("OTLP/gRPC reaches the receiver too", () =>
  Effect.gen(function* grpc() {
    const { grpcEndpoint } = yield* receiverAddress;
    yield* runChild("child-grpc", {
      OTEL_EXPORTER_OTLP_PROTOCOL: "grpc",
      OTEL_EXPORTER_OTLP_ENDPOINT: grpcEndpoint,
    });
    expect(yield* fromService("child-grpc")).toMatchObject([{ name: "child work" }]);
  }).pipe(services.runPromise));
