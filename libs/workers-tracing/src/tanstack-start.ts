import { createMiddleware } from "@tanstack/react-start";
import { tracing } from "cloudflare:workers";
import { Function } from "effect";

import { recordStatus, requestSpans, traced } from "./span.ts";

interface StartRequest<Result> {
  readonly request: Request;
  readonly pathname: string;
  readonly handlerType: string;
  readonly next: () => PromiseLike<Result> | Result;
}

interface ServerFnCall<Result> {
  readonly method: string;
  readonly serverFnMeta: { readonly id: string; readonly name: string; readonly filename: string };
  readonly next: () => PromiseLike<Result> | Result;
}

const traceRequest = <Result extends { readonly response: Response }>({
  request,
  pathname,
  handlerType,
  next,
}: StartRequest<Result>): Promise<Result> =>
  tracing.enterSpan(`${request.method} ${pathname}`, (span) => {
    span.setAttributes({
      "http.request.method": request.method,
      "url.path": pathname,
      "tanstack_start.handler": handlerType,
    });
    requestSpans.set(request, span);
    return traced(({ response }: Result) => recordStatus(response.status))(next)(span);
  });

const traceServerFn = <Result>({
  method,
  serverFnMeta,
  next,
}: ServerFnCall<Result>): Promise<Result> =>
  tracing.enterSpan(`serverFn ${serverFnMeta.name}`, (span) => {
    span.setAttributes({
      "tanstack_start.server_fn.id": serverFnMeta.id,
      "tanstack_start.server_fn.name": serverFnMeta.name,
      "code.file.path": serverFnMeta.filename,
      "http.request.method": method,
    });
    return traced<Result>(() => Function.constVoid)(next)(span);
  });

const requestSpan = createMiddleware().server(traceRequest);

const serverFnSpan = createMiddleware({ type: "function" }).server(traceServerFn);

export type { ServerFnCall, StartRequest };
export { requestSpan, serverFnSpan, traceRequest, traceServerFn };
