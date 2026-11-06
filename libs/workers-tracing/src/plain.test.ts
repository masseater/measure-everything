import { run, runner } from "@r_masseater/workers-tracing/effect";
import { Elysia } from "@r_masseater/workers-tracing/elysia";
import { Context, Effect, Layer } from "effect";
import { expect, test } from "vite-plus/test";

class Greeting extends Context.Service<Greeting, string>()(
  "@r_masseater/workers-tracing/plain.test/Greeting",
) {}

const GREETING = "hello";

test("in Node.js, run and runner run Effects without tracing", () =>
  Effect.gen(function* plainRun() {
    const runWithGreeting = runner(Layer.succeed(Greeting, GREETING));
    const greetings = yield* Effect.promise(() =>
      Promise.all([run(Effect.succeed(GREETING)), runWithGreeting(Effect.service(Greeting))]),
    );
    expect(greetings).toStrictEqual([GREETING, GREETING]);
  }).pipe(Effect.runPromise));

test("in Node.js, Elysia is the plain class", () =>
  Effect.gen(function* plainElysia() {
    const app = new Elysia().get("/", () => GREETING);
    const response = yield* Effect.promise(() => app.handle(new Request("http://localhost/")));
    const body = yield* Effect.promise(() => response.text());
    expect(body).toBe(GREETING);
  }).pipe(Effect.runPromise));
