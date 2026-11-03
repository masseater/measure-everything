import { NodeServices } from "@effect/platform-node";
import type { Scope } from "effect";
import {
  Array,
  Duration,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  MutableRef,
  Option,
  Predicate,
  Record,
  Schedule,
  Schema,
  Scope as Scopes,
  Stream,
  String,
  pipe,
} from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { TestProject } from "vite-plus/test/node";

import { FORWARD_KEY, SEMCONV_KEY } from "./context.ts";
import type { ResolvedSemconv, SemconvLevel } from "./context.ts";

const taggedError = Schema.TaggedError;

class SemconvCheckFailed extends taggedError<
  SemconvCheckFailed,
  { readonly brand: unique symbol }
>()("SemconvCheckFailed", { message: Schema.String }) {}

const LEVELS: readonly SemconvLevel[] = ["information", "improvement", "violation"];
const ADVICE_KEY = "all_advice";
const READY_POLL_MILLIS = 100;
const READY_TIMEOUT_SECONDS = 120;
const READY_POLL = Schedule.spaced(Duration.millis(READY_POLL_MILLIS));
const READY_TIMEOUT = Duration.seconds(READY_TIMEOUT_SECONDS);
const REPORT_INDENT = "\n  ";

const GRPC_LISTENER = /OTLP gRPC listener started on (?<address>[\d.]+:\d+)/v;
const ADMIN = /POST to (?<admin>http:\/\/[\d.]+:\d+)\/stop/v;

interface Weaver {
  readonly grpc: string;
  readonly admin: string;
}

const Advice = Schema.Struct({
  id: Schema.String,
  level: Schema.Literals(LEVELS),
  message: Schema.String,
  signal_name: Schema.NullOr(Schema.String),
});

type Finding = typeof Advice.Type;

const decodeAdvice = Schema.decodeUnknownOption(Advice);

const checkFailed = (cause: unknown): SemconvCheckFailed =>
  SemconvCheckFailed.make({ message: globalThis.String(cause) });

const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

const childrenOf = (json: unknown): readonly (readonly [string, unknown])[] =>
  pipe(
    Option.liftPredicate(json, isList),
    Option.map(Array.map((child): readonly [string, unknown] => ["", child])),
    Option.orElse(() =>
      pipe(Option.liftPredicate(json, Predicate.isObject), Option.map(Record.toEntries)),
    ),
    Option.getOrElse(() => []),
  );

const isAdvice =
  (key: string) =>
  (value: unknown): value is readonly unknown[] =>
    key === ADVICE_KEY && isList(value);

const adviceIn = (json: unknown): readonly unknown[] =>
  pipe(
    childrenOf(json),
    Array.flatMap(([key, value]) =>
      Option.getOrElse(Option.liftPredicate(value, isAdvice(key)), () => adviceIn(value)),
    ),
  );

const atLeast =
  (failOn: SemconvLevel) =>
  (finding: Finding): boolean =>
    LEVELS.indexOf(finding.level) >= LEVELS.indexOf(failOn);

const signalSuffix = (finding: Finding): string =>
  pipe(
    Option.fromNullishOr(finding.signal_name),
    Option.map((name) => ` (${name})`),
    Option.getOrElse(() => ""),
  );

const describeFinding = (finding: Finding): string =>
  `${finding.level} ${finding.id}: ${finding.message}${signalSuffix(finding)}`;

const failingFindings =
  (failOn: SemconvLevel) =>
  (report: unknown): readonly string[] =>
    pipe(
      adviceIn(report),
      Array.map((advice) => decodeAdvice(advice)),
      Array.getSomes,
      Array.filter(atLeast(failOn)),
      Array.map(describeFinding),
      Array.dedupe,
    );

const grpcOf = (log: string): Option.Option<string> =>
  pipe(
    log,
    String.match(GRPC_LISTENER),
    Option.flatMap((match) => Option.fromNullishOr(match.groups)),
    Option.flatMap((groups) => Option.fromNullishOr(groups["address"])),
    Option.map((address) => `http://${address}`),
  );

const adminOf = (log: string): Option.Option<string> =>
  pipe(
    log,
    String.match(ADMIN),
    Option.flatMap((match) => Option.fromNullishOr(match.groups)),
    Option.flatMap((groups) => Option.fromNullishOr(groups["admin"])),
  );

const addressOf = (log: string): Option.Option<Weaver> =>
  Option.all({ grpc: grpcOf(log), admin: adminOf(log) });

const liveCheck = (semconv: ResolvedSemconv): ChildProcess.Command =>
  ChildProcess.make(semconv.weaver, [
    "registry",
    "live-check",
    "--registry",
    semconv.registry,
    "--input-source",
    "otlp",
    "--otlp-grpc-port",
    "0",
    "--admin-port",
    "0",
    "--format",
    "json",
    "--output",
    "http",
  ]);

const startWeaver = (
  semconv: ResolvedSemconv,
): Effect.Effect<
  Weaver,
  SemconvCheckFailed,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* weaverStart() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(liveCheck(semconv)).pipe(Effect.mapError(checkFailed));
    const log = MutableRef.make("");
    yield* handle.stderr.pipe(
      Stream.decodeText,
      Stream.runForEach((text) => Effect.sync(() => MutableRef.update(log, String.concat(text)))),
      Effect.forkScoped,
    );
    return yield* Effect.sync(() => addressOf(MutableRef.get(log))).pipe(
      Effect.flatMap(Effect.fromOption),
      Effect.retry(READY_POLL),
      Effect.timeout(READY_TIMEOUT),
      Effect.mapError(() => checkFailed(`weaver did not start:\n${MutableRef.get(log)}`)),
    );
  }).pipe(Effect.withSpan("vitest-otlp.semconv.start"));

const reportOf = (
  weaver: Weaver,
): Effect.Effect<unknown, SemconvCheckFailed, HttpClient.HttpClient> =>
  Effect.gen(function* weaverReport() {
    yield* HttpClient.execute(HttpClientRequest.post(`${weaver.admin}/stop`));
    const response = yield* HttpClient.execute(HttpClientRequest.get(`${weaver.admin}/report`));
    const body = yield* response.json;
    yield* HttpClient.execute(HttpClientRequest.post(`${weaver.admin}/shutdown`));
    return body;
  }).pipe(Effect.mapError(checkFailed), Effect.withSpan("vitest-otlp.semconv.report"));

const judge =
  (semconv: ResolvedSemconv) =>
  (report: unknown): Effect.Effect<void, SemconvCheckFailed> =>
    Array.match(failingFindings(semconv.failOn)(report), {
      onEmpty: () => Effect.void,
      onNonEmpty: (findings) =>
        Effect.fail(
          checkFailed(
            Array.join(
              ["Telemetry does not follow the semantic conventions:", ...findings],
              REPORT_INDENT,
            ),
          ),
        ),
    });

const runtime = ManagedRuntime.make(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer));

type Teardown = () => Promise<void>;

const noTeardown: Teardown = () => runtime.runPromise(Effect.void);

const checkedRun = (
  project: TestProject,
  semconv: ResolvedSemconv,
): Effect.Effect<Teardown, SemconvCheckFailed, ChildProcessSpawner.ChildProcessSpawner> => {
  const scope = Scopes.makeUnsafe();
  const finish = (weaver: Weaver): Effect.Effect<void, SemconvCheckFailed, HttpClient.HttpClient> =>
    reportOf(weaver).pipe(
      Effect.flatMap(judge(semconv)),
      Effect.ensuring(Scopes.close(scope, Exit.void)),
    );
  return startWeaver(semconv).pipe(
    Effect.tap((weaver) =>
      Effect.sync(() => {
        project.provide(FORWARD_KEY, [weaver.grpc]);
      }),
    ),
    Effect.map(
      (weaver): Teardown =>
        () =>
          runtime.runPromise(finish(weaver)),
    ),
    Scopes.provide(scope),
  );
};

const semconvOf = (project: TestProject): Option.Option<ResolvedSemconv> =>
  Option.fromNullishOr(project.getProvidedContext()[SEMCONV_KEY]);

const setup = (project: TestProject): Promise<() => Promise<void>> =>
  runtime.runPromise(
    Option.match(semconvOf(project), {
      onNone: () => Effect.succeed(noTeardown),
      onSome: (semconv) => checkedRun(project, semconv),
    }),
  );

export { setup };
