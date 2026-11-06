import { Effect, Layer, ManagedRuntime } from "effect";

type Run<Services> = <Success, Failure>(
  effect: Effect.Effect<Success, Failure, Services>,
) => Promise<Success>;

type Runner = <Services, LayerError>(services: Layer.Layer<Services, LayerError>) => Run<Services>;

const runnerWith =
  (tracing: Layer.Layer<never>): Runner =>
  (services) => {
    const runtime = ManagedRuntime.make(Layer.mergeAll(services, tracing));
    return (effect) =>
      runtime.runPromise(
        effect.pipe(Effect.tapCause((cause) => Effect.logError("request failed", cause))),
      );
  };

export type { Run, Runner };
export { runnerWith };
