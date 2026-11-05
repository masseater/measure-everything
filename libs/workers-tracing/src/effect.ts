import type { Span as WorkersSpan } from "@cloudflare/workers-types/index.ts";
import { tracing } from "cloudflare:workers";
import { Cause, Exit, Layer, Logger, Option, Predicate, Tracer, pipe } from "effect";
import type { Fiber } from "effect";

import { capture } from "./context.ts";
import type { RunInContext } from "./context.ts";
import { firstError, markFailed } from "./span.ts";

interface Mirror {
  readonly runInContext: RunInContext;
  readonly span: WorkersSpan;
}

const mirrors = new WeakMap<Tracer.AnySpan, Mirror>();

const fiberContexts = new WeakMap<Fiber.Fiber<unknown, unknown>, RunInContext>();

const nearestMirror = (span: Option.Option<Tracer.AnySpan>): Option.Option<Mirror> =>
  pipe(
    span,
    Option.flatMap((current) =>
      pipe(
        Option.fromUndefinedOr(mirrors.get(current)),
        Option.orElse(() => {
          if (Predicate.isTagged(current, "Span")) {
            return nearestMirror(current.parent);
          }
          return Option.none();
        }),
      ),
    ),
  );

const fiberContext = (fiber: Fiber.Fiber<unknown, unknown>): RunInContext =>
  pipe(
    Option.fromUndefinedOr(fiberContexts.get(fiber)),
    Option.getOrElse(() => {
      const captured = capture();
      fiberContexts.set(fiber, captured);
      return captured;
    }),
  );

const contextOf = (fiber: Fiber.Fiber<unknown, unknown>): RunInContext =>
  pipe(
    nearestMirror(Option.fromUndefinedOr(fiber.cache.span)),
    Option.match({ onNone: () => fiberContext(fiber), onSome: (mirror) => mirror.runInContext }),
  );

const isScalar = (value: unknown): value is boolean | number | string =>
  Predicate.isString(value) || Predicate.isNumber(value) || Predicate.isBoolean(value);

const mirrored = (native: Tracer.NativeSpan, mirror: Mirror): Tracer.Span => {
  mirrors.set(native, mirror);
  return Object.assign(native, {
    attribute: (key: string, value: unknown): void => {
      Tracer.NativeSpan.prototype.attribute.call(native, key, value);
      if (isScalar(value)) {
        mirror.span.setAttribute(key, value);
      }
    },
    end: (endTime: bigint, exit: Exit.Exit<unknown, unknown>): void => {
      Tracer.NativeSpan.prototype.end.call(native, endTime, exit);
      if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
        markFailed(firstError(exit.cause))(mirror.span);
      }
      mirror.span.end();
    },
  });
};

const workersTracer = Tracer.make({
  span: (options) => {
    const native = new Tracer.NativeSpan(options);
    if (!options.sampled) {
      return native;
    }
    const start = (): Tracer.Span =>
      tracing.startActiveSpan(options.name, (span) =>
        mirrored(native, { runInContext: capture(), span }),
      );
    return pipe(
      nearestMirror(options.parent),
      Option.match({ onNone: start, onSome: (parent) => parent.runInContext(start) }),
    );
  },
  context: (primitive, fiber) =>
    contextOf(fiber)(() => primitive["~effect/Effect/evaluate"](fiber)),
});

const inSpanContext = <Message>(
  logger: Logger.Logger<Message, void>,
): Logger.Logger<Message, void> =>
  Logger.make((options) => {
    contextOf(options.fiber)(() => {
      logger.log(options);
    });
  });

const consoleLogger = inSpanContext(Logger.withLeveledConsole(Logger.formatStructured));

const layer: Layer.Layer<never> = Layer.mergeAll(
  Layer.succeed(Tracer.Tracer, workersTracer),
  Logger.layer([consoleLogger]),
);

export { inSpanContext, layer };
