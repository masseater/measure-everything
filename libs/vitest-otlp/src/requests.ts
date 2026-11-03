interface Requests {
  readonly traces: readonly unknown[];
  readonly logs: readonly unknown[];
  readonly metrics: readonly unknown[];
}

type SignalKey = keyof Requests;

export type { Requests, SignalKey };
