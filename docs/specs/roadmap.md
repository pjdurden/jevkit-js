# jevkit roadmap

Seventeen packages across two registries, built as two monorepos that ship in
lockstep. Everything is unofficial and unaffiliated with TypeSafe.

## Why these are not seventeen projects

Four of the planned packages are the same package wearing different hats.
`pytest`/`vitest` need recorded (state, questions, answers) on disk. So does
`drift` for golden sets, `bench` for task instances, and `calibrate` for labeled
observations. That is **one format with four consumers**, which is why
[`.jevl`](./record-format-v1.md) is defined before anything that reads it.

The kernel (`jevkit-core` / `@jevkit/core`) holds what every tool needs and
nothing else: canonical digests, the record format, question normalization,
token budgets. It never calls the API.

## Lockstep

Both ecosystems ship the same version of the same capability at the same time.
The canonicalization is byte-identical across languages and is tested as such,
so a cassette recorded by the Python tools replays under the JavaScript ones.

## Waves

Each wave is independently shippable.

| Wave | Python | JavaScript | Status |
| --- | --- | --- | --- |
| 0 | `jevkit-core` | `@jevkit/core` | **done** |
| 1 | `jevkit-lint` | `@jevkit/lint` | **done** |
| 2 | `jevkit-pytest`, `jevkit-drift`, `jevkit-calibrate`, `jevkit-bench` | `@jevkit/vitest`, `@jevkit/drift`, `@jevkit/calibrate`, `@jevkit/bench` | planned |
| 3 | `jevkit-pydantic`, `jevkit-batch`, `jevkit-cli` | `@jevkit/zod`, `@jevkit/batch`, `@jevkit/cli` (incl. `sgrep`) | planned |
| 4 | `jevkit-dates`, `-extract`, `-classify`, `-tools`, `-guard` | same | planned |
| 5 | `jevkit-llamaindex`, `-langchain`, `-haystack` | n/a | planned |

Wave 5 is deliberately last. Framework adapters are the maintenance sinkhole:
they break when someone else ships, and they are the first thing to rot.

## Naming

`jev-lint` and `sgrep` were already taken on npm by unrelated packages, so
everything lives under one namespace: `@jevkit/*` on npm, `jevkit-*` on PyPI.

## Non-goals

- **No SDK.** TypeSafe ships `typesafe-sdk` and `@typesafe-ai/sdk`. jevkit is
  the ring around them, never a replacement.
- **No bundled tokenizer.** TypeSafe does not publish which tokenizer Jev uses.
  A confidently wrong count is worse than an honest approximation, so budgets
  are conservative estimates and say so.
- **No static adversarial-content rule.** Whether a state is hostile depends on
  runtime content, not on the question definition. A static rule would be
  theatre. That belongs in `guard`, at request time.
