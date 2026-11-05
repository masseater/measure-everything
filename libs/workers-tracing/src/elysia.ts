import type { Span } from "@cloudflare/workers-types/index.ts";
import { tracing } from "cloudflare:workers";
import { Option, pipe } from "effect";
import { Elysia } from "elysia";

import { markFailed, recordStatus, traced } from "./span.ts";

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

const tracedHandle =
  (handle: (request: Request) => Promise<Response>) =>
  (request: Request): Promise<Response> =>
    tracing.enterSpan(`${request.method} ${new URL(request.url).pathname}`, (span) => {
      span.setAttributes({
        "http.request.method": request.method,
        "url.path": new URL(request.url).pathname,
      });
      return traced(({ status }: Response) => recordStatus(status))(() => handle(request))(span);
    });

export { elysiaTracing, tracedHandle };
