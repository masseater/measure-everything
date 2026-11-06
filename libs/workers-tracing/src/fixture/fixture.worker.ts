import type { KVNamespace } from "@cloudflare/workers-types/index.ts";
import { runner } from "@r_masseater/workers-tracing/effect";
import { elysiaTracing, routeHandlers, tracedHandle } from "@r_masseater/workers-tracing/elysia";
import { traceRequest, traceServerFn } from "@r_masseater/workers-tracing/tanstack-start";
import { Array as Arr, Effect, Layer, Option, Schema, String, pipe } from "effect";
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

const run = runner(Layer.empty);

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

const app = (env: Env): Elysia["handle"] =>
  new Elysia({ adapter: CloudflareAdapter, aot: false })
    .use(elysiaTracing)
    .get("/items/:id", ({ params }) => run(saveGreeting(env, `item-${params.id}`)))
    .get("/api/items/:id", ({ params }) => run(saveGreeting(env, `api-${params.id}`))).handle;

const items = (env: Env, request: Request): Promise<Response> => tracedHandle(app(env))(request);

const viaStartRoute = (env: Env, request: Request): Effect.Effect<Response> =>
  Effect.promise(() =>
    traceRequest({
      request,
      pathname: new URL(request.url).pathname,
      handlerType: "router",
      next: () => {
        const { GET: handleGet } = routeHandlers(app(env));
        return handleGet({ request }).then((response) => ({ response }));
      },
    }),
  ).pipe(Effect.map(({ response }) => response));

const callServerFn = (env: Env): Promise<{ readonly response: Response }> =>
  run(
    Effect.promise(() =>
      traceServerFn({
        method: "POST",
        serverFnMeta: SERVER_FN,
        next: () => run(saveGreeting(env, "server-fn")),
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

type Route = (env: Env, request: Request) => Effect.Effect<Response>;

const ROUTES: readonly (readonly [string, Route])[] = [
  ["/api/", viaStartRoute],
  ["/items/", (env, request) => Effect.promise(() => items(env, request))],
  ["/start", viaStart],
  ["/fail", failGreeting],
];

const greet: Route = (env, request) =>
  saveGreeting(env, pipe(new URL(request.url).pathname, String.slice("/".length))).pipe(
    Effect.map((key) => new Response(key)),
  );

const route: Route = (env, request) => {
  const { pathname } = new URL(request.url);
  return pipe(
    ROUTES,
    Arr.findFirst(([prefix]) => pipe(pathname, String.startsWith(prefix))),
    Option.match({
      onNone: () => greet(env, request),
      onSome: ([, handle]) => handle(env, request),
    }),
  );
};

const worker = {
  fetch: (request: Request, env: Env): Promise<Response> => run(route(env, request)),
};

export default worker;
