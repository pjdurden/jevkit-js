# jevkit-drift

TypeSafe's docs warn that `jev-latest` moves when a new version ships, and that
confidence thresholds tuned against one version do not automatically hold on the
next. `jevkit-drift` answers the question that warning implies: for the requests
you actually care about, what changed?

> Unofficial and unaffiliated with TypeSafe.

```bash
npm install jevkit-drift
```

## Two kinds of change

A **flip** is a changed decision. Your code takes a different branch. This is
what breaks things.

A **shift** is movement in the probability distribution with the same decision
still on top. Harmless on its own, but it is what walks an answer toward a
threshold, so a large shift is an early warning before anything has flipped.

Both are reported separately, because conflating them is how a drift report ends
up either too noisy to read or too quiet to help.

## Use

```ts
import { readRecords, writeRecords } from "jevkit-core";
import { compareSets, replay } from "jevkit-drift";

const baseline = readRecords("golden.jevl");
const candidate = await replay(baseline, (s, q) =>
  client.systemOne(s, q, { model: "jev-1.14.0" }),
);
writeRecords("candidate.jevl", candidate);

const report = compareSets(baseline, candidate);
console.log(report.summary());

for (const [requestId, delta] of report.flips) {
  console.log(requestId, delta.describe());
}
```

## CLI

```bash
npx jevkit-drift golden.jevl candidate.jevl
npx jevkit-drift golden.jevl candidate.jevl --max-flips 3
npx jevkit-drift golden.jevl candidate.jevl --max-shift 0.15
npx jevkit-drift golden.jevl candidate.jevl --format json
```

Exit codes: `0` within tolerance, `1` drifted, `2` bad usage.

## How records are paired

On `request_id`, the digest of state plus questions with the model deliberately
excluded. That is the whole reason the record format keeps two digests: the full
`id` changes when the model changes, so it cannot pair a baseline with its
replay, while `request_id` can.

Change the state or a question and the records stop pairing, which is correct.
They are no longer the same request, and comparing them would be meaningless.
The CLI says so rather than reporting zero drift.

## License

MIT
