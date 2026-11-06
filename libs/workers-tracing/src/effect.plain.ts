import { Layer } from "effect";

import { runnerWith } from "./run.ts";
import type { Run, Runner } from "./run.ts";

const layer: Layer.Layer<never> = Layer.empty;

const runner: Runner = runnerWith(layer);

const run: Run<never> = runner(Layer.empty);

export type { Run, Runner } from "./run.ts";
export { layer, run, runner };
