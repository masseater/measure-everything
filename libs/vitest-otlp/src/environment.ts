import { Option, Predicate, Record, pipe } from "effect";

import type { ReceiverAddress } from "./telemetry.ts";

type Environment = Readonly<Record<string, string | undefined>>;

const UNSET = "";

const POINTED = {
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: UNSET,
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: UNSET,
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: UNSET,
  OTEL_TRACES_EXPORTER: "otlp",
  OTEL_METRICS_EXPORTER: "otlp",
  OTEL_LOGS_EXPORTER: "otlp",
} as const;

const QUICK_EXPORT = {
  OTEL_BSP_SCHEDULE_DELAY: "50",
  OTEL_BLRP_SCHEDULE_DELAY: "50",
  OTEL_METRIC_EXPORT_INTERVAL: "100",
  OTEL_METRIC_EXPORT_TIMEOUT: "100",
} as const;

const endpointFor =
  (address: ReceiverAddress) =>
  (env: Environment): string =>
    Option.match(
      Option.liftPredicate(env["OTEL_EXPORTER_OTLP_PROTOCOL"], (protocol) => protocol === "grpc"),
      { onNone: () => address.httpEndpoint, onSome: () => address.grpcEndpoint },
    );

const receiverEnvironment =
  (address: ReceiverAddress) =>
  (env: Environment): Readonly<Record<string, string>> => ({
    ...pipe(
      QUICK_EXPORT,
      Record.filter((_value, name) => Predicate.isUndefined(env[name])),
    ),
    ...POINTED,
    OTEL_EXPORTER_OTLP_ENDPOINT: endpointFor(address)(env),
  });

export { receiverEnvironment };
export type { Environment };
