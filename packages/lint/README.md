# @jevkit/lint

Static linter for [TypeSafe](https://typesafe.ai) Jev questions.

TypeSafe publishes a [list of failure modes](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
for `jev-1.13`: it reads instructions literally, it cannot count, it reads dates
as text rather than ordered quantities, it loses accuracy on indirection. Most
of those are visible in your question definitions before you send anything.

`jevkit-lint` reads the definitions and tells you. It never calls the API, so it
needs no key and costs nothing to run in CI.

> Unofficial and unaffiliated with TypeSafe.

## Install

```bash
npm install @jevkit/lint
```

## Use

```ts
import { lint } from "@jevkit/lint";

const result = lint({
  urgency: { type: "noul", instructions: "How many days has the customer waited?" },
  team: {
    type: "choice",
    instructions: "Which team should handle this",
    criteria: { billing: "Payment issues", technical: "Bugs" },
  },
});

console.log(result.format());
```

```
urgency: error [JEV001] Question asks the model to count or do arithmetic.
    found: How many
    hint:  jev-1.13 is not a calculator and does not count reliably. Iterate the
           candidates in code, ask one Noul per item, and sum the answers yourself.
team: warning [JEV008] Choice has no no-match option.
    found: billing, technical
    hint:  A Choice always returns one of its options. With nothing meaning 'none of
           these', a state that fits no option still produces a confident-looking
           answer. Add an explicit none/unknown option, or gate on a separate
           presence Noul.
```

`result.ok` is `true` when nothing rose to an error, so it drops straight into a
guard:

```ts
if (!lint(questions, { state }).ok) {
  throw new Error("refusing to send a request that will not answer what we meant");
}
```

## CLI

```bash
npx jevkit-lint request.json           # a {state, questions} object, or bare questions
npx jevkit-lint cassette.jevl          # lint every recorded request
npx jevkit-lint - < request.json       # stdin
npx jevkit-lint request.json --strict  # exit non-zero on warnings too
npx jevkit-lint request.json --format json
npx jevkit-lint --list-rules
```

Exit codes: `0` clean, `1` findings, `2` bad usage.

## Rules

Each rule names the documented failure mode it comes from.

| Code | Rule | Failure mode |
| --- | --- | --- |
| JEV001 | math-and-counting | Math and Numbers |
| JEV002 | date-comparison | Date and time comparison |
| JEV003 | generation-request | Generation |
| JEV004 | negation | Literal reading |
| JEV005 | vague-scoping | Literal reading |
| JEV006 | indirection | Indirection |
| JEV007 | noul-polarity | Contradictory instructions and criteria |
| JEV008 | choice-no-match | Common-sense structural invariants |
| JEV009 | choice-arity | Common-sense structural invariants |
| JEV010 | option-descriptions | Literal reading |
| JEV011 | score-levels | Literal reading |
| JEV012 | instructions-present | Literal reading |
| JEV013 | question-id-reference | Indirection |
| JEV014 | state-budget | Large state full of irrelevant detail |
| JEV015 | total-budget | Large state full of irrelevant detail |
| JEV016 | state-noise-ratio | Large state full of irrelevant detail |
| JEV017 | numeric-representation | Math and Numbers |
| JEV018 | duplicate-questions | Common-sense structural invariants |

Select or suppress by code:

```ts
lint(questions, { select: ["JEV001", "JEV002"] });
lint(questions, { ignore: ["JEV008"] });
```

## What it cannot do

Adversarial content is a documented failure mode and is **not** linted. Whether
a state is hostile depends on the content at runtime, not on the question
definition, so a static rule would be theatre. Screen untrusted state at
request time instead.

Token counts are estimates. jevkit deliberately does not bundle a tokenizer:
TypeSafe does not publish which one Jev uses, and a confidently wrong count is
worse than an honest approximation. The estimator errs conservative, so leave
headroom near the limits.

## License

MIT
