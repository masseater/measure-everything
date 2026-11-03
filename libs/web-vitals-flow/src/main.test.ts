import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { waitForSpans } from "@r_masseater/vitest-otlp";
import type { PlatformError } from "effect";
import {
  Array,
  Context,
  Effect,
  FileSystem,
  Layer,
  ManagedRuntime,
  Option,
  Path,
  pipe,
} from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { afterAll, expect, test } from "vite-plus/test";

const services = ManagedRuntime.make(NodeServices.layer);
afterAll(() => services.dispose());

const HTTP_NOT_FOUND = 404;
const SUCCESS = 0;

const PAGES: Readonly<Record<string, string>> = {
  "/": '<!doctype html><html lang="en"><title>home</title><h1>Home</h1><a href="/next">next</a></html>',
  "/next": '<!doctype html><html lang="en"><title>next</title><h1>Next</h1></html>',
};

const page = HttpServerRequest.HttpServerRequest.pipe(
  Effect.map((request) =>
    Option.match(Option.fromNullishOr(PAGES[request.url]), {
      onSome: (html) => HttpServerResponse.html(html),
      onNone: () => HttpServerResponse.empty({ status: HTTP_NOT_FOUND }),
    }),
  ),
);

const serveSite = Layer.build(NodeHttpServer.layerTest).pipe(
  Effect.orDie,
  Effect.map(Context.get(HttpServer.HttpServer)),
  Effect.tap((server) => server.serve(page)),
  Effect.map((server) => HttpServer.formatAddress(server.address)),
);

const measure = (
  origin: string,
  reportDirectory: string,
): Effect.Effect<
  ChildProcessSpawner.ExitCode,
  PlatformError.PlatformError,
  ChildProcessSpawner.ChildProcessSpawner | Path.Path
> =>
  Effect.gen(function* spawn() {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* spawner.exitCode(
      ChildProcess.make(
        process.execPath,
        [
          path.join(import.meta.dirname, "main.ts"),
          "--runs",
          "1",
          "--report-dir",
          reportDirectory,
          "--chrome-flags=--no-sandbox",
          `${origin}/`,
        ],
        { extendEnv: true, stdout: "inherit", stderr: "inherit" },
      ),
    );
  });

test("a load and a link transition are measured, reported and traced", () =>
  Effect.gen(function* measured() {
    const fileSystem = yield* FileSystem.FileSystem;
    const origin = yield* serveSite;
    const reportDirectory = yield* fileSystem.makeTempDirectoryScoped();

    expect(yield* measure(origin, reportDirectory)).toBe(SUCCESS);
    expect(yield* fileSystem.readDirectory(reportDirectory)).toStrictEqual(
      expect.arrayContaining(["flow-1.html", "flow-1.json"]),
    );
    const spans = yield* waitForSpans({
      where: (span) => span.resource["service.name"] === "web-vitals-flow",
      count: 4,
    });
    expect(
      pipe(
        spans,
        Array.map((span) => span.name),
      ),
    ).toStrictEqual(
      expect.arrayContaining([
        "web-vitals.flow",
        "web-vitals.load",
        "web-vitals.transition",
        "web-vitals.audit",
      ]),
    );
  }).pipe(Effect.scoped, services.runPromise));
