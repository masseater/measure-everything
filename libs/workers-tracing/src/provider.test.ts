import { Worker } from "@alchemy.run/cloudflare/Workers/Worker";
import type { WorkerProps } from "@alchemy.run/cloudflare/Workers/Worker";
import { effect as providerLayer, tryFindProviderRegistrationByType } from "alchemy/Provider";
import type { ProviderService } from "alchemy/Provider";
import { noopSession } from "alchemy/Report";
import { Array as Arr, Effect, ManagedRuntime, Option } from "effect";
import { expect, test } from "vite-plus/test";

import { COMPATIBILITY_DATE, traced, tuneService, withWorkersTracing } from "./alchemy.ts";

const TRACE_DESTINATION = "traces";
const OPTIONS = { destinations: [TRACE_DESTINATION] };

const OLD_DATE = "2026-01-01";
const NEW_DATE = "2026-12-01";
const MODES = 3;

test("a Worker gets logs, traces, the trace destination and a new enough compatibility date", () => {
  expect(traced(OPTIONS)({ main: "worker.ts", compatibility: { date: OLD_DATE } })).toMatchObject({
    main: "worker.ts",
    compatibility: { date: COMPATIBILITY_DATE },
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: true, persist: true },
      traces: { enabled: true, persist: true, destinations: [TRACE_DESTINATION] },
    },
  });
});

test("a Worker keeps its own newer date, log and trace settings and destinations", () => {
  expect(
    traced(OPTIONS)({
      compatibility: { date: NEW_DATE, flags: ["nodejs_compat"] },
      observability: {
        logs: { enabled: true, invocationLogs: false },
        traces: { persist: false, destinations: ["elsewhere", TRACE_DESTINATION] },
      },
    }),
  ).toMatchObject({
    compatibility: { date: NEW_DATE, flags: ["nodejs_compat"] },
    observability: {
      logs: { invocationLogs: false },
      traces: { enabled: true, persist: false, destinations: ["elsewhere", TRACE_DESTINATION] },
    },
  });
});

test("a version of another Worker is left alone", () => {
  const props: WorkerProps = { version: { parent: "site" } };
  expect(traced(OPTIONS)(props)).toBe(props);
});

test("a Worker that turns its traces off is left alone", () => {
  const props: WorkerProps = { observability: { traces: { enabled: false } } };
  expect(traced(OPTIONS)(props)).toBe(props);
});

test("a Worker that tags its own versions is still traced", () => {
  expect(traced(OPTIONS)({ version: { tag: "release" } })).toMatchObject({
    version: { tag: "release" },
    observability: { traces: { enabled: true, destinations: [TRACE_DESTINATION] } },
  });
});

type WorkerService = ProviderService<Worker>;

type ReconcileInput =
  Parameters<WorkerService["reconcile"]> extends readonly [infer Input] ? Input : never;

const reconcileInput: ReconcileInput = {
  id: "app",
  fqn: "app",
  instanceId: "app",
  news: { main: "a.ts" },
  olds: Option.getOrUndefined(Option.none<WorkerProps>()),
  output: Option.getOrUndefined(Option.none()),
  session: noopSession,
  bindings: [],
};

const fakeVariant = {
  list: (): Effect.Effect<[]> => Effect.succeed([]),
  delete: (): Effect.Effect<void> => Effect.void,
  reconcile: ({ news }): Effect.Effect<never> => Effect.die(news),
} satisfies WorkerService;

const fakeProvider = {
  ...fakeVariant,
  modes: { live: Effect.succeed(fakeVariant), local: Effect.succeed(fakeVariant) },
} satisfies WorkerService;

const reconciledNews: (variant: Readonly<typeof fakeVariant>) => Effect.Effect<unknown> = (
  variant,
) => variant.reconcile(reconcileInput).pipe(Effect.catchDefect((news) => Effect.succeed(news)));

test("every mode of the Worker provider reconciles traced props", () =>
  Effect.gen(function* everyMode() {
    const tuned = tuneService(OPTIONS)(fakeProvider);
    const news = yield* Effect.all([
      reconciledNews(tuned),
      tuned.modes.live.pipe(Effect.flatMap(reconciledNews)),
      tuned.modes.local.pipe(Effect.flatMap(reconciledNews)),
    ]);
    expect(news).toMatchObject(
      Arr.replicate(
        { main: "a.ts", observability: { traces: { destinations: [TRACE_DESTINATION] } } },
        MODES,
      ),
    );
  }).pipe(Effect.runPromise));

const registration = providerLayer(Worker, Effect.succeed(fakeProvider));

const stack = ManagedRuntime.make(withWorkersTracing(OPTIONS)(registration));

test("a stack's providers answer for Workers with the traced provider", () =>
  stack.runPromise(
    Effect.gen(function* registered() {
      const found = yield* tryFindProviderRegistrationByType<Worker>(Worker.Type);
      const modes = Option.flatMapNullishOr(found, (service) => service.modes);
      expect(Option.isSome(modes)).toBe(true);
      expect(Option.contains(modes, fakeProvider.modes)).toBe(false);
    }),
  ));
