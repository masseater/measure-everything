import type { KVNamespace } from "@cloudflare/workers-types/index.ts";
import { layer } from "@r_masseater/workers-tracing/effect";
import { elysiaTracing, tracedHandle } from "@r_masseater/workers-tracing/elysia";
import { traceRequest, traceServerFn } from "@r_masseater/workers-tracing/tanstack-start";
import { Effect, ManagedRuntime, Schema, String, pipe } from "effect";
import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";

interface Env {
  readonly CACHE: KVNamespace;
}

const taggedError = Schema.TaggedError;

class GreetingFailed extends taggedError<GreetingFailed, { readonly brand: unique symbol }>()(
  "GreetingFailed",
  { message: Schema.String },
) {}

const SERVER_ERROR = 500;
const SERVER_FN = { id: "fn-1", name: "saveGreetingFn", filename: "src/greeting.ts" };

const runtime = ManagedRuntime.make(layer);

const saveGreeting = (env: Env, key: string): Effect.Effect<string> =>
  Effect.promise(() => env.CACHE.put(key, "hello")).pipe(
    Effect.tap(() => Effect.logInfo(`cached ${key}`)),
    Effect.withSpan("greeting.put"),
    Effect.as(key),
    Effect.withSpan("greeting.save", { attributes: { "greeting.key": key } }),
  );

const failGreeting = (): Effect.Effect<Response> =>
  Effect.fail(GreetingFailed.make({ message: "boom" })).pipe(
    Effect.withSpan("greeting.fail"),
    Effect.as(new Response("unreachable")),
    Effect.orElseSucceed(() => new Response("failed", { status: SERVER_ERROR })),
  );

const items = (env: Env, request: Request): Promise<Response> =>
  tracedHandle(
    new Elysia({ adapter: CloudflareAdapter, aot: false })
      .use(elysiaTracing)
      .get("/items/:id", ({ params }) => runtime.runPromise(saveGreeting(env, `item-${params.id}`)))
      .handle,
  )(request);

const callServerFn = (env: Env): Promise<{ readonly response: Response }> =>
  runtime.runPromise(
    Effect.promise(() =>
      traceServerFn({
        method: "POST",
        serverFnMeta: SERVER_FN,
        next: () => runtime.runPromise(saveGreeting(env, "server-fn")),
      }),
    ).pipe(Effect.map((key) => ({ response: new Response(key) }))),
  );

const viaStart = (env: Env, request: Request): Effect.Effect<Response> =>
  Effect.promise(() =>
    traceRequest({
      request,
      pathname: "/start",
      handlerType: "router",
      next: () => callServerFn(env),
    }),
  ).pipe(Effect.map(({ response }) => response));

const route = (env: Env, request: Request): Effect.Effect<Response> => {
  const { pathname } = new URL(request.url);
  if (pipe(pathname, String.startsWith("/items/"))) {
    return Effect.promise(() => items(env, request));
  }
  if (pathname === "/start") {
    return viaStart(env, request);
  }
  if (pathname === "/fail") {
    return failGreeting();
  }
  return saveGreeting(env, pipe(pathname, String.slice("/".length))).pipe(
    Effect.map((key) => new Response(key)),
  );
};

const worker = {
  fetch: (request: Request, env: Env): Promise<Response> => runtime.runPromise(route(env, request)),
};

export default worker;
