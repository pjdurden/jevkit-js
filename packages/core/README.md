# @jevkit/core

Shared substrate for [jevkit](https://github.com/pjdurden/jevkit-js), a set of
tools for building on TypeSafe's Jev. Nothing in this package calls the API.

- **`.jevl` record format** — one JSON Lines format that serves as test
  cassette, drift golden set, benchmark instance, and calibration observation.
  See [the spec](../../docs/specs/record-format-v1.md).
- **Canonical digests** — RFC 8785 canonicalization, so the same request always
  hashes the same way. `record_id()` includes the model; `request_id()` does
  not, which is what lets you pair a golden record with its replay on a new
  model version.
- **Question normalization** — one view over SDK objects and plain dicts alike.
- **Token budgets** — estimates against Jev's two documented limits: 64k for
  state plus all questions, 32k for state plus the longest single question.

> Unofficial and unaffiliated with TypeSafe.

## Install

```bash
npm install @jevkit/core
```

## License

MIT
