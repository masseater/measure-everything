## コマンド

- コマンドは `vp` から実行し、`pnpm`・`npx` は直接使わない。`vp run <name>` は `package.json` と `vite.config.ts` のタスクで、組み込みコマンドとは別物である。
- `vp run verify` が検査をまとめて流す。pre-push フックと Stop フックも同じ verify を走らせる。
- `vp check` は oxlint-plugin-decision の判定に `.env` の `OPENROUTER_API_KEY` を使う。
- テストを 1 つだけ走らせるときは、そのパッケージで `vp test run <ファイル>` を実行する。
- 各パッケージの `vp run build` は `vp pack` で `dist/` を作る。

## 構成

- 計測の部品を `libs/<部品名>` に 1 つずつ置き、npm の `@r_masseater/<部品名>` で出す。部品は既存の計測の仕組み（OpenTelemetry、各ツールの公式の拡張点）を差し込むだけにし、計測の仕組みそのものは作らない。
- 使う側は Vite+ と Node.js 26 以降だけを前提にする。`vite-plus` は peer に置き、`vitest` 単体などほかの環境向けの書き換えや分岐を足さない。
- `libs/vitest-otlp` は、`setupFiles` でテストファイルごとに `@elastic/mockotlpserver` を空きポートで立て、`OTEL_*` の環境変数をそこへ向ける。受け取った OTLP は `effect` の Schema で平らな形に直して溜める。

## 公開

- main の verify が通ると release-please がタグを打ち、`publish.yml` が npm に出す。npm へは Trusted Publisher で出し、トークンを置かない。

## ライブラリ

- ライブラリが型を提供する値は、その型のまま `Schema.decode*` に渡す。
- ライブラリが export する型・スキーマ・enum・定数を書き写さない。
- 外部 API のクライアントは手で包まず、Effect 公式のパッケージ、distilled.cloud（Cloudflare は `@distilled.cloud/cloudflare`）、公開 OpenAPI から `@effect/openapi-generator` で生成、の順に選ぶ。

## PR とマージ

- PR のレビュー、PR ごとの CI・動作検証・デプロイはしない。動作は本番で確かめる。
- マージ前に base を取り込み、手元の `vp run verify` を通してから自分でマージする。マージしてよいかは聞かない。ルールセットのバイパスや `--admin` は使わない。
- release-please のリリース PR は `verify` を手動実行して作り直す。`up-to-date` が承認待ちで取り込むものも無ければ、ユーザーに承認を頼む。

## oxlint-plugin-decision

- 有料の decider は、無料の `openrouter/respan/span-01-lite` で判定できないルールだけに使う。判定できるかは、正解の分かる違反例と違反でない例を、キャッシュを消して `OXLINT_DECISION_EXPLAIN=json` で確かめる。
- ルールが使うモデルは、ユーザーの指示なしに変えない。
- 確信できるものだけを違反にする。閾値を下げて取りこぼしを拾いにいかない。

## 脆弱性

- `audit` は `vp pm audit --fix` で直す。修正版の無い勧告だけを `audit.ignore` に載せ、理由をコミットメッセージに書く。

## 公開先

- デプロイ先や外部公開しているもの（サイト、API、npm パッケージなど）があれば、その URL を README に一覧で載せる。

## スキル

- 編集の前に、リポジトリのルートで `vp exec intent list` を実行する。合う skill があれば `vp exec intent load <package>#<skill>` で読む。`intent` が無いときはインストールせず、不足を報告する。
- 複数リポで使う自作スキルは masseater/skills に置き、skills CLI で入れる。
