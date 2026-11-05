import type { Span } from "@cloudflare/workers-types/index.ts";
import { Array, Cause, Effect, Inspectable, Option, Predicate, Schema, pipe } from "effect";

const taggedError = Schema.TaggedError;

class HandlerFailed extends taggedError<HandlerFailed, { readonly brand: unique symbol }>()(
  "HandlerFailed",
  { cause: Schema.Unknown },
) {}

interface Exception {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

const SERVER_ERROR = 500;

const exceptionOf = (error: unknown): Exception =>
  pipe(
    Option.liftPredicate(error, Predicate.isError),
    Option.match({
      onNone: () => ({ name: "Error", message: Inspectable.toStringUnknown(error) }),
      onSome: ({ name, message, stack }) =>
        pipe(
          Option.fromUndefinedOr(stack),
          Option.match({
            onNone: () => ({ name, message }),
            onSome: (trace) => ({ name, message, stack: trace }),
          }),
        ),
    }),
  );

const markFailed =
  (error: unknown) =>
  (span: Span): void => {
    const exception = exceptionOf(error);
    span.setStatus({ code: "error", message: exception.message });
    span.recordException(exception);
  };

const firstError = (cause: Cause.Cause<unknown>): unknown =>
  pipe(Cause.prettyErrors(cause), Array.head, Option.getOrUndefined);

const recordStatus =
  (status: number) =>
  (span: Span): void => {
    span.setAttribute("http.response.status_code", status);
    if (status >= SERVER_ERROR) {
      span.setStatus({ code: "error" });
    }
  };

const traced =
  <Result>(observe: (result: Result) => (span: Span) => void) =>
  (run: () => PromiseLike<Result> | Result) =>
  (span: Span): Promise<Result> =>
    Effect.runPromise(
      Effect.tryPromise({
        try: () => Promise.resolve(run()),
        catch: (cause) => HandlerFailed.make({ cause }),
      }).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            observe(result)(span);
          }),
        ),
        Effect.tapError(({ cause }) =>
          Effect.sync(() => {
            markFailed(cause)(span);
          }),
        ),
        Effect.catchTag("HandlerFailed", ({ cause }) => Effect.die(cause)),
      ),
    );

export { firstError, markFailed, recordStatus, traced };
