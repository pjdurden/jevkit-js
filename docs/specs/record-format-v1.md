# JEVL Record Format v1

`.jevl` is a JSON Lines file. One JSON object per line, UTF-8, newline-terminated.

It is the shared substrate for four jevkit packages:

| Package | Uses a record as |
| --- | --- |
| `jevkit-pytest` / `jevkit-vitest` | a cassette: replay `answers` instead of calling the API |
| `jevkit-drift` | a golden set: replay `request` against a new model, diff `answers` |
| `jevkit-bench` | a task instance: `tags` select the suite, `label` scores it |
| `jevkit-calibrate` | a labeled observation: `answers.probabilities` vs `label` |

One format, four readers. Adding a fifth consumer must not require a format change.

## Line schema

```jsonc
{
  "v": 1,                        // int, format version. Required.
  "id": "sha256:ab12…",          // canonical request digest. Required. See below.
  "ts": "2026-09-19T19:40:00Z",  // RFC3339 UTC, when recorded. Required.
  "model": "jev-1.13.0",         // versioned id that answered, NOT the alias. Required.
  "request": {                   // exactly what was sent. Required.
    "state": <string|object|array>,
    "questions": { "<qid>": <question> }
  },
  "answers": { "<qid>": <answer> },   // exactly what came back. Required.
  "usage": { "input_tokens": 424, "output_tokens": 73 },  // Optional.
  "label": { "<qid>": <ground truth> },                   // Optional.
  "tags": ["routing", "v2"],                              // Optional.
  "meta": { }                                             // Optional, free-form.
}
```

### `id` — the canonical request digest

`id` identifies a request, not a response. Two records with the same `id`
were produced by the same `state` + `questions` + `model`, so a cassette can
match on it and a drift run can pair old and new answers by it.

Computed as `"sha256:" + hex(sha256(canonical_json(payload)))` where
`payload` is `{"model": …, "state": …, "questions": …}` and `canonical_json`
is RFC 8785 JSON Canonicalization Scheme: object keys sorted by code point,
no insignificant whitespace, UTF-8, shortest-form numbers.

`model` participates in the digest. Replaying a golden set against a new
version therefore produces a *different* `id`, which is why `jevkit-drift`
pairs records on the digest of `{state, questions}` alone, exposed as
`request_id()`. Both digests are derivable from the record; only the full
one is stored.

### `answers`

Stored verbatim as the API returned them, including `probabilities`,
`confidence`, `legend`. Never normalized, rounded, or reordered on write.
Consumers that need rounding do it at read time.

### `label`

Ground truth, keyed by question id, shaped to match the question type:
a Choice label is an option key, a Score label is a level index or float,
a Noul label is `true`/`false`. Absent when unknown. A record with no
`label` is still valid; it is simply not usable by `calibrate` or `bench`.

## File-level rules

- No header line. A `.jevl` file is concatenable with `cat`.
- Records are unordered. Consumers that need order sort by `ts`.
- Duplicate `id` values are permitted: the same request recorded twice.
  Cassette readers resolve to the **last** matching record in file order.
- Unknown top-level keys are preserved on rewrite and ignored on read.
  This is how v1 stays forward-compatible.
- A line that fails to parse is an error, not a skip. Silent skipping hides
  truncated files, which is how golden sets quietly stop covering anything.

## Versioning

`v` is the format version, independent of any package version. A reader that
encounters `v` greater than it knows must refuse the file rather than guess.
