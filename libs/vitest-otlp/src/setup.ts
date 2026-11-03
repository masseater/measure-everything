import { Effect, Exit, Option, Scope } from "effect";
import { afterAll } from "vite-plus/test";

import { receiverEnvironment } from "./environment.ts";
import { startReceiver } from "./receiver.ts";
import { setReceiver } from "./store.ts";

const scope = Scope.makeUnsafe();

const receiver = await Effect.runPromise(Scope.provide(startReceiver, scope));
setReceiver(Option.some(receiver));
Object.assign(process.env, receiverEnvironment(receiver.address)(process.env));

const stop = Effect.sync(() => {
  setReceiver(Option.none());
}).pipe(Effect.andThen(Scope.close(scope, Exit.void)));

afterAll(() => Effect.runPromise(stop));
