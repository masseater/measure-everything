import { expect, test } from "vite-plus/test";

import { receiverEnvironment } from "./environment.ts";

const toReceiver = receiverEnvironment({
  httpEndpoint: "http://127.0.0.1:1",
  grpcEndpoint: "http://127.0.0.1:2",
});

test("signal-specific endpoints are emptied so test telemetry cannot leak to a real collector", () => {
  expect(
    toReceiver({
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://collector.example/v1/traces",
      OTEL_METRIC_EXPORT_INTERVAL: "1000",
    }),
  ).toStrictEqual({
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:1",
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "",
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "",
    OTEL_TRACES_EXPORTER: "otlp",
    OTEL_METRICS_EXPORTER: "otlp",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_BSP_SCHEDULE_DELAY: "50",
    OTEL_BLRP_SCHEDULE_DELAY: "50",
    OTEL_METRIC_EXPORT_TIMEOUT: "100",
  });
});

test("the gRPC protocol gets the gRPC endpoint", () => {
  expect(toReceiver({ OTEL_EXPORTER_OTLP_PROTOCOL: "grpc" })).toMatchObject({
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:2",
  });
});
