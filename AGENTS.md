## Commands

- Run commands through `vp`; never call `pnpm` or `npx` directly. `vp run <name>` runs a task from `package.json` or `vite.config.ts`, which is not the same as a built-in command.
- `vp run verify` runs every check. The pre-push and Stop hooks run the same verify.
- `vp check` uses `OPENROUTER_API_KEY` from `.env` for oxlint-plugin-decision.
- To run one test, run `vp test run <file>` in its package.
- `vp run build` in each package builds `dist/` with `vp pack`.
- `vp run generate` in `libs/vitest-otlp` regenerates the protobuf-es code in `src/generated` from opentelemetry-proto. Never edit the generated files.

## Layout

- Each package lives in `libs/<name>` and is published to npm as `@r_masseater/<name>`.
- Official features and auto-instrumentation of each service and tool come first. A package is added only for what they leave out, and it only plugs into OpenTelemetry or a tool's official extension point.
- Packages assume Vite+ and Node.js 26 or later only. `vite-plus` is a peer dependency; do not add rewrites or branches for other environments such as plain `vitest`.
- Do not reuse libraries that ship no type definitions; implement the part instead.
- `libs/vitest-otlp` starts an OTLP receiver (HTTP and gRPC) per test file from `setupFiles`, points the `OTEL_*` variables at it, and decodes what arrives with the generated protobuf-es code and Effect Schemas.
- `libs/web-vitals-flow` is a CLI that runs Lighthouse user flows several times and judges each step by the median. Its test measures a local page in Chrome and checks its spans with `vitest-otlp`.
- `tools/claude-plugin` is the Claude Code plugin, listed by `.claude-plugin/marketplace.json`. Its `measure-everything` skill says which means to use in which situation; update it whenever a package or a recommended method changes.
- The last job of `verify.yml` runs `.github/scripts/ci-telemetry.sh`. It sends job and step durations with a GitHub OIDC token to the ci-telemetry Worker of masseater/masseater.dev, which writes them to Workers Logs.

## Writing

- Documents, the skill, README files, commit messages and PR descriptions are written in English.

## Publishing

- When main's verify passes, release-please tags a release and `publish.yml` publishes to npm through a Trusted Publisher, with no token stored. All packages share one version.

## Libraries

- Pass values whose types a library provides to `Schema.decode*` with those types.
- Do not copy types, schemas, enums or constants that a library exports.
- For external API clients, do not wrap them by hand. Choose, in order, an official Effect package, distilled.cloud (`@distilled.cloud/cloudflare` for Cloudflare), or a client generated from a public OpenAPI with `@effect/openapi-generator`.

## Pull requests and merging

- No PR reviews and no per-PR CI, verification or deployment. Behavior is checked in production.
- Before merging, bring in the base branch and pass `vp run verify` locally, then merge yourself without asking. Never bypass rulesets or use `--admin`.
- Recreate a release-please PR by running `verify` manually. `up-to-date` on a PR opened by github-actions[bot] waits for approval (action_required); re-run that run yourself instead of asking the user.

## oxlint-plugin-decision

- Use a paid decider only for rules the free `openrouter/respan/span-01-lite` cannot judge. Check that with violating and non-violating examples whose answers are known, with the cache cleared and `OXLINT_DECISION_EXPLAIN=json`.
- Do not change the model a rule uses without the user's instruction.
- Report only what is certain. Do not lower thresholds to catch misses.

## Vulnerabilities

- Fix `audit` findings with `vp pm audit --fix`. Only advisories without a fixed version go into `audit.ignore`, with the reason in the commit message.

## Published endpoints

- List every deployment and published artifact (sites, APIs, npm packages) with its URL in the README.

## Skills

- Before editing, run `vp exec intent list` at the repository root. If a skill fits, load it with `vp exec intent load <package>#<skill>`. If `intent` is missing, report it instead of installing it.
- Personal skills shared across repositories live in masseater/skills and are installed with the skills CLI.
