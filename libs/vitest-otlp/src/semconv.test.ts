import { NodeServices } from "@effect/platform-node";
import type { PlatformError, Scope } from "effect";
import { Effect, ManagedRuntime, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { afterAll, expect, test } from "vite-plus/test";

const services = ManagedRuntime.make(NodeServices.layer);
afterAll(() => services.dispose());

const SUCCESS = 0;
const FAILURE = 1;
const FIXTURE_TIMEOUT_MILLIS = 180_000;

interface Run {
  readonly exitCode: number;
  readonly output: string;
}

const runFixture = (
  fixture: string,
): Effect.Effect<
  Run,
  PlatformError.PlatformError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function* fixtureRun() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make("vp", ["test", "run", "--root", "src/semconv-fixture", "-t", fixture], {
        cwd: `${import.meta.dirname}/..`,
      }),
    );
    const output = yield* handle.all.pipe(Stream.decodeText, Stream.mkString);
    return { exitCode: yield* handle.exitCode, output };
  });

test(
  "telemetry that follows the semantic conventions passes the run",
  () =>
    Effect.gen(function* conforming() {
      const run = yield* runFixture("conforming");
      expect(run).toMatchObject({ exitCode: SUCCESS });
    }).pipe(Effect.scoped, services.runPromise),
  FIXTURE_TIMEOUT_MILLIS,
);

test(
  "a violation of the semantic conventions fails the run and names the finding",
  () =>
    Effect.gen(function* violating() {
      const run = yield* runFixture("violating");
      expect(run.exitCode).toBe(FAILURE);
      expect(run.output).toContain(
        "violation type_mismatch: Attribute 'http.response.status_code' has type 'string'",
      );
    }).pipe(Effect.scoped, services.runPromise),
  FIXTURE_TIMEOUT_MILLIS,
);
