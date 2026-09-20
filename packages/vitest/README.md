# jevkit-vitest

Record and replay TypeSafe Jev requests in vitest.

A model call in a test is slow, costs money, needs a key in CI, and can change
its answer under you when the alias moves. The fix is the one VCR established for
HTTP: record real responses once, replay them forever, re-record on purpose.

> Unofficial and unaffiliated with TypeSafe.

```bash
npm install -D jevkit-vitest
```

## Use

```ts
import { expect, it } from "vitest";
import { cassetteFor } from "jevkit-vitest";

it("routes billing questions", async () => {
  const cassette = cassetteFor("routes billing questions", { systemOne });
  const response = await cassette.systemOne(
    "I was charged twice for the same order",
    { team: { type: "choice", instructions: "Which team should handle this",
              criteria: { billing: "Payment issues", technical: "Bugs",
                          unknown: "None apply" } } },
  );
  expect(response.answers.team.choice).toBe("billing");
});
```

Record the first time, then never again:

```bash
JEV_RECORD=1 vitest       # record anything missing
vitest                    # replay only; a miss is a failure
JEV_RERECORD=1 vitest     # replace every recording
```

To record you need a live client. Pass its `systemOne` when building the
cassette:

```ts
import { TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();
const systemOne = (state, questions, options) =>
  client.systemOne({ state, questions, ...options });
```

Replay-only runs need no client and no API key, which is the point: CI stays
green without a secret.

## Assertions that explain themselves

```ts
import { assertAnswer, assertConfident } from "jevkit-vitest";

assertAnswer(response.answers.team, "billing", { minProbability: 0.6 });
assertConfident(response.answers.urgency, 0.8);
```

On failure these print the whole distribution, because a 0.51/0.49 split and a
0.99/0.01 split are different bugs and `toBe` cannot tell them apart.

`assert_confident` uses the API's confidence for Choice and Score. A Noul carries
none, so its distance from 0.5 is used and the message says which it used.

## Cassettes are golden sets

A cassette is a `.jevl` file, the same format `jevkit-drift`, `jevkit-bench` and
`jevkit-calibrate` read. So the recordings your tests already make are a golden
set you can replay against the next model version:

```bash
npx jevkit-drift test/cassettes/routes_billing_questions.jevl candidate.jevl
```

That is the whole reason the format was defined before any of these packages.

## License

MIT
