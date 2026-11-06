import { Worker } from "@alchemy.run/cloudflare/Workers/Worker";
import type { WorkerProps } from "@alchemy.run/cloudflare/Workers/Worker";
import { effect as providerLayer, tryFindProviderRegistrationByType } from "alchemy/Provider";
import type { ProviderService } from "alchemy/Provider";
import { Array as Arr, Effect, Layer, Option, Order, Predicate, Record as Rec, pipe } from "effect";

const COMPATIBILITY_DATE = "2026-08-25";

const TRACE_DESTINATION = "masseater-dev-traces";

const laterDate = Order.max(Order.String);

const withDestination = (destinations: readonly string[] | null | undefined): string[] =>
  pipe(
    Option.fromNullishOr(destinations),
    Option.getOrElse((): readonly string[] => []),
    Arr.append(TRACE_DESTINATION),
    Arr.dedupe,
  );

const traced = (props: WorkerProps): WorkerProps => {
  if (Predicate.isNotUndefined(props.version)) {
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
        ...traces,
        enabled: true,
        persist: true,
        destinations: withDestination(destinations),
      },
    },
  };
};

type WorkerService = ProviderService<Worker>;

type Tunable = Readonly<{ news: WorkerProps; olds?: WorkerProps | undefined }>;

const tracedInput = <Input extends Tunable>(input: Input): Input => ({
  ...input,
  news: traced(input.news),
  ...pipe(
    Option.fromUndefinedOr(input.olds),
    Option.match({ onNone: () => ({}), onSome: (olds) => ({ olds: traced(olds) }) }),
  ),
});

const tunedReconcile = <Input extends Tunable, Output>(
  service: Readonly<{ reconcile: (input: Input) => Output }>,
): Readonly<{ reconcile: (input: Input) => Output }> => ({
  reconcile: (input) => service.reconcile(tracedInput(input)),
});

const tunedPrecreate = <Input extends Tunable, Output>(
  service: Readonly<{ precreate?: ((input: Input) => Output) | undefined }>,
): Readonly<{ precreate?: (input: Input) => Output }> =>
  pipe(
    Option.fromUndefinedOr(service.precreate),
    Option.match({
      onNone: () => ({}),
      onSome: (precreate) => ({
        precreate: (input: Input): Output => precreate(tracedInput(input)),
      }),
    }),
  );

const tuneService = <Service extends WorkerService>(service: Service): Service => ({
  ...service,
  ...tunedReconcile(service),
  ...tunedPrecreate(service),
  ...pipe(
    Option.fromUndefinedOr(service.modes),
    Option.match({
      onNone: () => ({}),
      onSome: (modes) => ({ modes: pipe(modes, Rec.map(Effect.map(tuneService))) }),
    }),
  ),
});

const tracingProvider = providerLayer(
  Worker,
  tryFindProviderRegistrationByType<Worker>(Worker.Type).pipe(
    Effect.flatMap(Effect.fromOption),
    Effect.map(tuneService),
    Effect.orDie,
  ),
);

const withWorkersTracing = <Out, Error, In>(
  providers: Layer.Layer<Out, Error, In>,
): Layer.Layer<Out, Error, In> => Layer.provideMerge(tracingProvider, providers);

export type { WorkerService };
export { COMPATIBILITY_DATE, TRACE_DESTINATION, traced, tuneService, withWorkersTracing };
