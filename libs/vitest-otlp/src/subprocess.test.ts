import { NodeServices } from "@effect/platform-node";
import type { PlatformError } from "effect";
import { Effect, ManagedRuntime } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { afterAll, expect, test } from "vite-plus/test";

import type { ReadError, ReceivedSpan, TelemetryNotReceived } from "./index.ts";
import { receiverAddress, waitForSpans } from "./index.ts";

const services = ManagedRuntime.make(NodeServices.layer);
afterAll(() => services.dispose());

const SUCCESS = 0;

const CHILD_SCRIPT = `
  const { trace } = require("@opentelemetry/api");
  const { NodeSDK } = require("@opentelemetry/sdk-node");
  const sdk = new NodeSDK();
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
        ChildProcess.make(process.execPath, ["-e", CHILD_SCRIPT], {
          cwd: import.meta.dirname,
          env: { ...env, OTEL_SERVICE_NAME: serviceName },
          extendEnv: true,
        }),
      ),
    ),
    Effect.tap((exitCode) =>
      Effect.sync(() => {
        expect(exitCode).toBe(SUCCESS);
      }),
    ),
  );

const fromService = (
  serviceName: string,
): Effect.Effect<readonly ReceivedSpan[], TelemetryNotReceived | ReadError> =>
  waitForSpans({ where: (span) => span.resource["service.name"] === serviceName });

test("a child process inherits the receiver through the environment", () =>
  Effect.gen(function* inherited() {
    yield* runChild("child-http");
    const spans = yield* fromService("child-http");
    expect(spans).toMatchObject([{ name: "child work" }]);
  }).pipe(services.runPromise));

test("OTLP/gRPC reaches the receiver too", () =>
  Effect.gen(function* grpc() {
    const { grpcEndpoint } = yield* receiverAddress;
    yield* runChild("child-grpc", {
      OTEL_EXPORTER_OTLP_PROTOCOL: "grpc",
      OTEL_EXPORTER_OTLP_ENDPOINT: grpcEndpoint,
    });
    const spans = yield* fromService("child-grpc");
    expect(spans).toMatchObject([{ name: "child work" }]);
  }).pipe(services.runPromise));

test("gzip-compressed exports are read over both transports", () =>
  Effect.gen(function* gzip() {
    const { grpcEndpoint } = yield* receiverAddress;
    yield* runChild("gzip-http", { OTEL_EXPORTER_OTLP_COMPRESSION: "gzip" });
    yield* runChild("gzip-grpc", {
      OTEL_EXPORTER_OTLP_COMPRESSION: "gzip",
      OTEL_EXPORTER_OTLP_PROTOCOL: "grpc",
      OTEL_EXPORTER_OTLP_ENDPOINT: grpcEndpoint,
    });
    const httpSpans = yield* fromService("gzip-http");
    expect(httpSpans).toMatchObject([{ name: "child work" }]);
    const grpcSpans = yield* fromService("gzip-grpc");
    expect(grpcSpans).toMatchObject([{ name: "child work" }]);
  }).pipe(services.runPromise));
