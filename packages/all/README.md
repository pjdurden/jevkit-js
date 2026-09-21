# @jevkit/all

Tooling for building on [TypeSafe](https://typesafe.ai)'s Jev, the first System
One model. Jev returns typed answers and calibrated probabilities instead of
generated text; jevkit is the ring of tools around that.

This package installs nothing of its own. It is a convenience umbrella that
pulls in the whole set:

```bash
npm install @jevkit/all
```

| Package | What it does |
| --- | --- |
| [`jevkit-core`](https://www.npmjs.com/package/jevkit-core) | the `.jevl` record format, canonical request digests, question normalization, token budgets |
| [`jevkit-lint`](https://www.npmjs.com/package/jevkit-lint) | static linting of your questions before you pay for them |
| [`jevkit-drift`](https://www.npmjs.com/package/jevkit-drift) | detect when answers move under you |
| [`jevkit-bench`](https://www.npmjs.com/package/jevkit-bench) | score a labeled suite for accuracy and cost, and compare two runs |
| [`jevkit-calibrate`](https://www.npmjs.com/package/jevkit-calibrate) | reliability diagrams, ECE, Brier, and confidence thresholds from labeled outcomes |
| [`jevkit-vitest`](https://www.npmjs.com/package/jevkit-vitest) | vitest integration |

Prefer installing only what you use. The umbrella exists so one install gets you the whole ring.

The unscoped name `jevkit` is unavailable: npm blocks it as too similar to an
unrelated package, `jev-kit`, published two hours after these packages.

The same tools are on PyPI as `jevkit-core`, `jevkit-lint`, `jevkit-pytest`,
`jevkit-drift`, `jevkit-bench` and `jevkit-calibrate`. See
[jevkit-py](https://github.com/pjdurden/jevkit-py).

> Unofficial and unaffiliated with TypeSafe. Not an SDK: TypeSafe ships its own.

MIT licensed.
