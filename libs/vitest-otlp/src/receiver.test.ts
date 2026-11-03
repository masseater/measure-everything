import { Effect, ManagedRuntime } from "effect";
import type { HttpClientError } from "effect/http";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { afterAll, expect, test } from "vite-plus/test";

import type { ReceiverNotRunning } from "./index.ts";
import { receiverAddress } from "./index.ts";

const client = ManagedRuntime.make(FetchHttpClient.layer);
afterAll(() => client.dispose());

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const post = (
  path: string,
  body: string,
  contentType: string,
): Effect.Effect<
  number,
  ReceiverNotRunning | HttpClientError.HttpClientError,
  HttpClient.HttpClient
> =>
  receiverAddress.pipe(
    Effect.flatMap(({ httpEndpoint }) =>
      HttpClient.execute(
        HttpClientRequest.post(`${httpEndpoint}${path}`).pipe(
          HttpClientRequest.bodyText(body, contentType),
        ),
      ),
    ),
    Effect.map((response) => response.status),
  );

test("an unknown path is not found", () =>
  Effect.gen(function* unknownPath() {
    expect(yield* post("/v1/profiles", "{}", "application/json")).toBe(HTTP_NOT_FOUND);
  }).pipe(client.runPromise));

test("a body that is not OTLP is rejected", () =>
  Effect.gen(function* notOtlp() {
    expect(yield* post("/v1/traces", "not json", "application/json")).toBe(HTTP_BAD_REQUEST);
  }).pipe(client.runPromise));
