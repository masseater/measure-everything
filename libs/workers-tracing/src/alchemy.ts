import { Worker } from "@alchemy.run/cloudflare/Workers/Worker";
import type { WorkerProps } from "@alchemy.run/cloudflare/Workers/Worker";
import { effect as providerLayer, tryFindProviderRegistrationByType } from "alchemy/Provider";
import type { ProviderService } from "alchemy/Provider";
import { Array as Arr, Effect, Layer, Option, Order, Predicate, Record as Rec, pipe } from "effect";

import { COMPATIBILITY_DATE } from "./compatibility.ts";

const laterDate = Order.max(Order.String);

interface TracingOptions {
  readonly destinations?: readonly string[];
}

const withDestinations =
  (added: readonly string[]) =>
  (own: readonly string[] | null | undefined): string[] =>
    pipe(
      Option.fromNullishOr(own),
      Option.getOrElse((): readonly string[] => []),
      Arr.appendAll(added),
      Arr.dedupe,
    );

const isVersionOfAnotherWorker = ({ version }: WorkerProps): boolean =>
  pipe(
    Option.fromUndefinedOr(version),
    Option.exists(({ parent }) => Predicate.isNotUndefined(parent)),
  );

const optsOutOfTraces = ({ observability }: WorkerProps): boolean =>
  pipe(
    Option.fromUndefinedOr(observability),
    Option.flatMapNullishOr(({ traces }) => traces),
    Option.exists(({ enabled }) => enabled === false),
  );

const traced =
  (options: TracingOptions = {}) =>
  (props: WorkerProps): WorkerProps => {
    if (isVersionOfAnotherWorker(props) || optsOutOfTraces(props)) {
      return props;
    }
    const { observability = {}, compatibility = {} } = props;
    const { logs, traces } = observability;
    const destinations = pipe(
      Option.fromNullishOr(traces),
      Option.flatMapNullishOr((own) => own.destinations),
      Option.getOrUndefined,
    );
    return {
      ...props,
      compatibility: {
        ...compatibility,
        date: laterDate(compatibility.date ?? COMPATIBILITY_DATE, COMPATIBILITY_DATE),
      },
      observability: {
        ...observability,
        enabled: true,
        logs: { enabled: true, invocationLogs: true, persist: true, ...logs },
        traces: {
          enabled: true,
          persist: true,
          ...traces,
          destinations: withDestinations(options.destinations ?? [])(destinations),
        },
      },
    };
  };

type WorkerService = ProviderService<Worker>;

type Tunable = Readonly<{ news: WorkerProps; olds?: WorkerProps | undefined }>;

const tracedInput =
  (options: TracingOptions) =>
  <Input extends Tunable>(input: Input): Input => ({
    ...input,
    news: traced(options)(input.news),
    ...pipe(
      Option.fromUndefinedOr(input.olds),
      Option.match({ onNone: () => ({}), onSome: (olds) => ({ olds: traced(options)(olds) }) }),
    ),
  });

const tunedReconcile =
  (options: TracingOptions) =>
  <Input extends Tunable, Output>(
    service: Readonly<{ reconcile: (input: Input) => Output }>,
  ): Readonly<{ reconcile: (input: Input) => Output }> => ({
    reconcile: (input) => service.reconcile(tracedInput(options)(input)),
  });

const tunedPrecreate =
  (options: TracingOptions) =>
  <Input extends Tunable, Output>(
    service: Readonly<{ precreate?: ((input: Input) => Output) | undefined }>,
  ): Readonly<{ precreate?: (input: Input) => Output }> =>
    pipe(
      Option.fromUndefinedOr(service.precreate),
      Option.match({
        onNone: () => ({}),
        onSome: (precreate) => ({
          precreate: (input: Input): Output => precreate(tracedInput(options)(input)),
        }),
      }),
    );

const tuneService =
  (options: TracingOptions) =>
  <Service extends WorkerService>(service: Service): Service => ({
    ...service,
    ...tunedReconcile(options)(service),
    ...tunedPrecreate(options)(service),
    ...pipe(
      Option.fromUndefinedOr(service.modes),
      Option.match({
        onNone: () => ({}),
        onSome: (modes) => {
          const tune = tuneService(options);
          return { modes: pipe(modes, Rec.map(Effect.map(tune))) };
        },
      }),
    ),
  });

const tracingProvider = (options: TracingOptions): Layer.Layer<never> => {
  const tune = tuneService(options);
  return providerLayer(
    Worker,
    tryFindProviderRegistrationByType<Worker>(Worker.Type).pipe(
      Effect.flatMap(Effect.fromOption),
      Effect.map(tune),
      Effect.orDie,
    ),
  );
};

const withWorkersTracing =
  (options: TracingOptions = {}) =>
  <Out, Error, In>(providers: Layer.Layer<Out, Error, In>): Layer.Layer<Out, Error, In> =>
    Layer.provideMerge(tracingProvider(options), providers);

export type { TracingOptions, WorkerService };
export { traced, tuneService, withWorkersTracing };
export { COMPATIBILITY_DATE } from "./compatibility.ts";
export { DEFAULT_DESTINATION, traceSink } from "./trace-sink.ts";
export type { TraceSinkProps } from "./trace-sink.ts";
