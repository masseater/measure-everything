# Changelog

## [0.1.0](https://github.com/masseater/measure-everything/compare/v0.0.7...v0.1.0) (2026-11-06)


### ⚠ BREAKING CHANGES

* **workers-tracing:** withWorkersTracing is curried and takes { destinations }; TRACE_DESTINATION and the fixed masseater-dev-traces destination are gone. tracedHandle and elysiaTracing are replaced by Elysia from the package, and the Effect tracer is applied through run and runner.

### Features

* **workers-tracing:** bring back routeHandlers for TanStack Start API routes ([#68](https://github.com/masseater/measure-everything/issues/68)) ([12ea32a](https://github.com/masseater/measure-everything/commit/12ea32a71da269c87a19462477aaeba193443e31))
* **workers-tracing:** make tracing automatic and usable outside one account ([#67](https://github.com/masseater/measure-everything/issues/67)) ([96c26e6](https://github.com/masseater/measure-everything/commit/96c26e6d52db2010e35390bf5957896dcba35916))


### Bug Fixes

* satisfy the new @effect/tsgo yield-in-call-argument and global-json rules ([#66](https://github.com/masseater/measure-everything/issues/66)) ([3cce0bf](https://github.com/masseater/measure-everything/commit/3cce0bf75215d6758185afe0ab81339719df490e))
* **workers-traces:** name the missing spans when the check fails ([#65](https://github.com/masseater/measure-everything/issues/65)) ([f9d96dd](https://github.com/masseater/measure-everything/commit/f9d96dd6c03b038a5b9cd619df2947fc23eaa20e))
* **workers-tracing:** let the lint preset allow type imports of Elysia ([#69](https://github.com/masseater/measure-everything/issues/69)) ([fe94e4e](https://github.com/masseater/measure-everything/commit/fe94e4ea6f64f2b38ef4ef18af112cb43eb77474))

## [0.0.7](https://github.com/masseater/measure-everything/compare/v0.0.6...v0.0.7) (2026-11-06)


### Features

* **workers-traces:** check the trace of a request the CLI sends ([#63](https://github.com/masseater/measure-everything/issues/63)) ([359561e](https://github.com/masseater/measure-everything/commit/359561e95b7430f2ad2cdcebb9a7f08ddde5671b))
* **workers-tracing:** trace every Worker through the Alchemy provider and check that spans arrive ([#62](https://github.com/masseater/measure-everything/issues/62)) ([0d3e73f](https://github.com/masseater/measure-everything/commit/0d3e73f67b76f72bb1b0543d7a4fc9859b4ba260))

## [0.0.6](https://github.com/masseater/measure-everything/compare/v0.0.5...v0.0.6) (2026-11-05)


### Bug Fixes

* **workers-tracing:** give the browser a no-op tanstack-start entry ([#53](https://github.com/masseater/measure-everything/issues/53)) ([85c1f4d](https://github.com/masseater/measure-everything/commit/85c1f4d17190715bfb85e0eb3342652328c731fe))

## [0.0.5](https://github.com/masseater/measure-everything/compare/v0.0.4...v0.0.5) (2026-11-05)


### Bug Fixes

* **workers-tracing:** point exports at the files the build emits ([#51](https://github.com/masseater/measure-everything/issues/51)) ([2bcd490](https://github.com/masseater/measure-everything/commit/2bcd490d39477a9d6c63a4ac00f7c3fa0d455353))

## [0.0.4](https://github.com/masseater/measure-everything/compare/v0.0.3...v0.0.4) (2026-11-05)


### Features

* **workers-tracing:** add auto spans for Effect, TanStack Start and Elysia on Workers ([#44](https://github.com/masseater/measure-everything/issues/44)) ([d4d24d5](https://github.com/masseater/measure-everything/commit/d4d24d5de10e8dcb0b4d6c7e277d36d4d5f02b35))


### Bug Fixes

* **deps:** effect 4.1.2・alchemy 2.0.0-beta.85・lint-kit 0.1.0 に上げる ([#36](https://github.com/masseater/measure-everything/issues/36)) ([3f7df45](https://github.com/masseater/measure-everything/commit/3f7df45b2db5153e4c1e9ba805371dfe510df117))

## [0.0.3](https://github.com/masseater/measure-everything/compare/v0.0.2...v0.0.3) (2026-11-04)


### Bug Fixes

* **publish:** build the packages when they are packed ([#32](https://github.com/masseater/measure-everything/issues/32)) ([164f276](https://github.com/masseater/measure-everything/commit/164f276de9b5e054d1dbfe24059cf32c9c4fc4b2))

## [0.0.2](https://github.com/masseater/measure-everything/compare/v0.0.1...v0.0.2) (2026-11-03)


### chore

* release 0.0.2 ([#27](https://github.com/masseater/measure-everything/issues/27)) ([cf9d5e6](https://github.com/masseater/measure-everything/commit/cf9d5e6c68957b4a01dc98b7b5242701a2e282a6))

## [0.0.1](https://github.com/masseater/measure-everything/compare/v0.0.0...v0.0.1) (2026-11-03)


### Features

* **ci:** send job and step durations to masseater.dev's ci-telemetry Worker ([#23](https://github.com/masseater/measure-everything/issues/23)) ([5a6e604](https://github.com/masseater/measure-everything/commit/5a6e6040dcd49bcf2756a5de917fac098d37b660))
