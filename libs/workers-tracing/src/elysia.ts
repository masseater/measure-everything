import type { Span } from "@cloudflare/workers-types/index.ts";
import { tracing } from "cloudflare:workers";
import { Option, pipe } from "effect";
import { Elysia as PlainElysia } from "elysia";
import type { ElysiaConfig } from "elysia";

import type { Handle } from "./route-handlers.ts";
import { markFailed, recordStatus, requestSpans, traced } from "./span.ts";

type Fetch = PlainElysia["fetch"];

const activeSpan = (): Option.Option<Span> => Option.fromUndefinedOr(tracing.getActiveSpan());

const routeNames = new PlainElysia({ name: "@r_masseater/workers-tracing/elysia" })
  .onBeforeHandle({ as: "global" }, ({ request, route }) => {
    Option.map(activeSpan(), (span) =>
      span.updateName(`${request.method} ${route}`).setAttribute("http.route", route),
    );
  })
  .onError({ as: "global" }, ({ error }) => {
    pipe(activeSpan(), Option.map(markFailed(error)));
  });

const ownSpan = (inner: Fetch, request: Request): Promise<Response> =>
  tracing.enterSpan(`${request.method} ${new URL(request.url).pathname}`, (span) => {
    span.setAttributes({
      "http.request.method": request.method,
      "url.path": new URL(request.url).pathname,
    });
    return traced(({ status }: Response) => recordStatus(status))(() => inner(request))(span);
  });

const tracedFetch =
  (inner: Fetch): Handle =>
  (request) =>
    pipe(
      Option.fromUndefinedOr(requestSpans.get(request)),
      Option.match({
        onNone: () => ownSpan(inner, request),
        onSome: () => Promise.resolve(inner(request)),
      }),
    );

const install = (app: object, inner: Fetch): Handle => {
  const wrapped = tracedFetch(inner);
  Object.defineProperty(app, "fetch", { value: wrapped, configurable: true, writable: true });
  return wrapped;
};

const Elysia: typeof PlainElysia = new Proxy(PlainElysia, {
  construct: (_target, [config]: readonly ElysiaConfig<string>[]) => {
    const app = new PlainElysia(config);
    const compile = app.compile.bind(app);
    Object.defineProperty(app, "fetch", {
      configurable: true,
      get: (): Handle => {
        Reflect.deleteProperty(app, "fetch");
        return install(app, app.fetch);
      },
    });
    app.compile = (): typeof app => {
      install(app, compile().fetch);
      return app;
    };
    return app.use(routeNames);
  },
});

export type { Handle, RouteHandler, RouteHandlers } from "./route-handlers.ts";
export { routeHandlers } from "./route-handlers.ts";
export { Elysia };
