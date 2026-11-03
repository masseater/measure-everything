# measure-everything

あらゆるものを既存の仕組みの上で計測できるようにする部品を集めたリポジトリである。
計測の仕組みそのものは作らず、OpenTelemetry と各ツールの公式の拡張点に差し込む。

部品は [Vite+](https://viteplus.dev/) と Node.js 26 以降で動く。`vite-plus` を peer に持つ。

## 公開先

- npm: [@r_masseater/vitest-otlp](https://www.npmjs.com/package/@r_masseater/vitest-otlp)

## 部品

### @r_masseater/vitest-otlp

テストの中で OTLP を受け取り、送り出されたスパン・メトリクス・ログをアサートする
Vitest のプラグインである。
自動計装や `OTEL_*` の設定が正しく、テレメトリーが本当に外へ出ているかを、テストで確かめられる。

テストファイルごとに、空きポートで OTLP サーバー（HTTP と gRPC）を立てる。
サーバーには Elastic の [@elastic/mockotlpserver][mockotlpserver] を使う。

[mockotlpserver]: https://www.npmjs.com/package/@elastic/mockotlpserver

サーバーの場所は `OTEL_EXPORTER_OTLP_ENDPOINT` などの環境変数でテストに渡す。
設定を環境変数から読む SDK は、コードを変えずにこのサーバーへ送る。
テストから起動した子プロセスも、環境変数を受け継いで同じサーバーへ送る。

in-memory exporter と違い、OTLP の送信と環境変数の読み取りを本番と同じ経路で通す。
コンテナで Collector や grafana/otel-lgtm を立てる方法と違い、Docker が要らない。
受け取ったものは、テストの中でそのまま読める。

```sh
vp add -D @r_masseater/vitest-otlp
```

```ts
import { otlp } from "@r_masseater/vitest-otlp";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [otlp()],
});
```

読み出しの API は Effect で書く。

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { waitForSpans } from "@r_masseater/vitest-otlp";
import { Effect } from "effect";
import { expect, test } from "vite-plus/test";

test("checkout is traced", () =>
  Effect.gen(function* () {
    const sdk = new NodeSDK();
    sdk.start();
    yield* checkout;
    yield* Effect.promise(() => sdk.shutdown());

    const spans = yield* waitForSpans({
      where: (span) => span.name === "checkout",
    });
    expect(spans).toMatchObject([{ attributes: { "order.id": "o-1" } }]);
  }).pipe(Effect.runPromise));
```

`waitForSpans`・`waitForLogs`・`waitForMetrics` は、`where` に合うものが
`count` 件（既定 1）届くまで `interval`（既定 20 ms）ごとに読み直し、合うものをすべて返す。
`timeout`（既定 5 秒）を過ぎると、届いた件数を添えた `TelemetryNotReceived` で失敗する。
`receivedSpans`・`receivedLogs`・`receivedMetrics` は、そのテストファイルで今までに届いたものを返す。
`clearTelemetry` は届いたものを捨て、`receiverAddress` はサーバーの
`httpEndpoint` と `grpcEndpoint` を返す。

属性は `{ "order.id": "o-1" }` のような平らなオブジェクトに、ID は 16 進の文字列に直してある。
スパンとログには、`resource`（リソースの属性）と `scope`（計装のスコープ）が付く。

プラグインは、テストに渡す環境変数を次のように変える。

- `OTEL_EXPORTER_OTLP_ENDPOINT`: サーバーの HTTP の URL。
  `OTEL_EXPORTER_OTLP_PROTOCOL` が `grpc` なら gRPC の URL
- `OTEL_TRACES_EXPORTER`・`OTEL_METRICS_EXPORTER`・`OTEL_LOGS_EXPORTER`: `otlp`
- `OTEL_BSP_SCHEDULE_DELAY`・`OTEL_BLRP_SCHEDULE_DELAY`: 50。未設定のときだけ
- `OTEL_METRIC_EXPORT_INTERVAL`・`OTEL_METRIC_EXPORT_TIMEOUT`: 100。未設定のときだけ
- 信号ごとの `OTEL_EXPORTER_OTLP_<信号>_ENDPOINT`: 空。テストのテレメトリーを外の Collector へ漏らさない

テストファイルが終わるとサーバーは閉じる。
そのため、`isolate: false` で複数のファイルが SDK を使い回すと、
2 つ目以降のファイルのテレメトリーは届かない。

## ライセンス

MIT
