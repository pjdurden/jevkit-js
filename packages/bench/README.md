# jevkit-bench

Score a labeled Jev suite for accuracy **and** cost, and compare two runs.

Any one number alone is easy to win. Accuracy without cost hides that you spent
ten times the tokens; cost without accuracy hides that you broke the task. This
reports them together.

> Unofficial and unaffiliated with TypeSafe.

```bash
pip install jevkit-bench
```

## Use

```python
from jevkit_core import read_records
from jevkit_bench import compare_suites, score_records

suite = score_records(read_records("suite.jevl"))
print(suite.summary())

for failure in suite.failures()[:5]:
    print(failure.question_id, failure.predicted, "should be", failure.label)
```

`failures()` sorts by probability descending, so the most confident wrong answers
come first. Those are the interesting bugs: a wrong answer at 0.35 is the model
telling you it was unsure, while a wrong answer at 0.98 is a question that needs
rewriting.

## Comparing runs

```python
comparison = compare_suites(baseline, candidate)
print(comparison.summary())
print(comparison.regressions)   # right before, wrong now
```

Aggregate accuracy can hold perfectly steady while the set of things you get
right churns underneath. That matters when a specific case is the one you
promised someone would work, so regressions and fixes are tracked individually
rather than netted off.

## CLI

```bash
jevkit-bench suite.jevl
jevkit-bench suite.jevl --baseline last-week.jevl
jevkit-bench suite.jevl --min-accuracy 0.90              # CI gate
jevkit-bench suite.jevl --baseline last-week.jevl --max-regressions 0
jevkit-bench suite.jevl --show-failures 10
```

## Cost

Computed from input tokens at $0.042 per million, Jev's published price. Output
tokens are free on Jev, so they are reported but never billed. Override with
`--price-per-mtok` if your plan differs.

## License

MIT
