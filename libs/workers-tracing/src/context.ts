import { AsyncLocalStorage } from "node:async_hooks";

type RunInContext = <Result>(evaluate: () => Result) => Result;

const capture = (): RunInContext => {
  const snapshot = AsyncLocalStorage.snapshot();
  return (evaluate) => snapshot(evaluate);
};

export type { RunInContext };
export { capture };
