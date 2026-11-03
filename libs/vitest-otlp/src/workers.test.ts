import { Array, Effect } from "effect";
import { Miniflare } from "miniflare";
import { expect, test } from "vite-plus/test";

import { waitForLogs, waitForSpans } from "./index.ts";
import { tailWorker } from "./workers.ts";

const APP = `export default {
  async fetch(request, env) {
    await env.CACHE.put("greeting", "hello");
    console.log("cached greeting");
    return new Response("ok");
  },
};`;

const withMiniflare = Effect.acquireRelease(
  tailWorker({ serviceName: "app" }).pipe(
    Effect.map(
      (tail) =>
        new Miniflare({
          workers: [
            {
              name: "app",
              modules: true,
              script: APP,
              compatibilityDate: "2026-07-01",
              kvNamespaces: ["CACHE"],
              streamingTails: [tail.name],
            },
            tail,
          ],
        }),
    ),
  ),
  (miniflare) => Effect.promise(() => miniflare.dispose()),
);

test("a Worker's automatic spans and logs reach the receiver through a streaming tail worker", () =>
  Effect.gen(function* workerSpans() {
    const miniflare = yield* withMiniflare;
    const response = yield* Effect.promise(() => miniflare.dispatchFetch("http://localhost/"));
    expect(yield* Effect.promise(() => response.text())).toBe("ok");

    const servers = yield* waitForSpans({ where: (span) => span.name === "fetch" });
    const server = yield* Effect.fromOption(Array.head(servers));
    expect(server).toMatchObject({
      kind: "SPAN_KIND_SERVER",
      attributes: { "http.request.method": "GET", "url.full": "http://localhost/" },
      resource: { "service.name": "app" },
    });

    const kv = yield* waitForSpans({ where: (span) => span.name === "kv_put" });
    expect(kv).toMatchObject([
      {
        kind: "SPAN_KIND_CLIENT",
        traceId: server.traceId,
        parentSpanId: server.spanId,
        attributes: { "db.system.name": "cloudflare-kv", "db.operation.name": "put" },
      },
    ]);

    const logs = yield* waitForLogs({ where: (record) => record.body === "cached greeting" });
    expect(logs).toMatchObject([{ severityText: "log", traceId: server.traceId }]);
  }).pipe(Effect.scoped, Effect.runPromise));
