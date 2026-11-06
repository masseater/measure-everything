import type { Span } from "@cloudflare/workers-types/index.ts";
import { tracing } from "cloudflare:workers";
import { Option, pipe } from "effect";
import { Elysia } from "elysia";

import { markFailed, recordStatus, requestSpans, traced } from "./span.ts";

type Handle = (request: Request) => Promise<Response>;

const activeSpan = (): Option.Option<Span> => Option.fromUndefinedOr(tracing.getActiveSpan());

const elysiaTracing = new Elysia({ name: "@r_masseater/workers-tracing/elysia" })
  .onBeforeHandle({ as: "global" }, ({ request, route }) => {
    Option.map(activeSpan(), (span) =>
      span.updateName(`${request.method} ${route}`).setAttribute("http.route", route),
    );
  })
  .onError({ as: "global" }, ({ error }) => {
    pipe(activeSpan(), Option.map(markFailed(error)));
  });

const ownSpan = (handle: Handle, request: Request): Promise<Response> =>
  tracing.enterSpan(`${request.method} ${new URL(request.url).pathname}`, (span) => {
    span.setAttributes({
      "http.request.method": request.method,
      "url.path": new URL(request.url).pathname,
    });
    return traced(({ status }: Response) => recordStatus(status))(() => handle(request))(span);
  });

const tracedHandle =
  (handle: Handle) =>
  (request: Request): Promise<Response> =>
    pipe(
      Option.fromUndefinedOr(requestSpans.get(request)),
      Option.match({
        onNone: () => ownSpan(handle, request),
        onSome: () => handle(request),
      }),
    );

type RouteHandler = (context: Readonly<{ request: Request }>) => Promise<Response>;

const routeHandlers = (
  handle: Handle,
): Readonly<Record<"DELETE" | "GET" | "PATCH" | "POST" | "PUT", RouteHandler>> => {
  const handleTraced = tracedHandle(handle);
  const handler: RouteHandler = ({ request }) => handleTraced(request);
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
};

export type { Handle, RouteHandler };
export { elysiaTracing, routeHandlers, tracedHandle };
