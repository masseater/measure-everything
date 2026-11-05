import { createMiddleware } from "@tanstack/react-start";

const passThrough = <Result>({
  next,
}: Readonly<{ next: () => PromiseLike<Result> | Result }>): Promise<Result> =>
  Promise.resolve(next());

const requestSpan = createMiddleware().server(passThrough);
const serverFnSpan = createMiddleware({ type: "function" }).server(passThrough);

export { passThrough as traceRequest, passThrough as traceServerFn, requestSpan, serverFnSpan };
