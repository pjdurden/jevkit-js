# jevkit-calibrate

Calibration is Jev's central claim: the probabilities are meant to track real
frequencies, so that among answers given 0.8, about 80% are right. TypeSafe
measures this across groups of predictions and says plainly that it does not
guarantee any individual answer.

This package checks the claim on **your** data, which is the part nobody else
can do for you, and turns the result into a threshold you can defend.

> Unofficial and unaffiliated with TypeSafe.

```bash
pip install jevkit-calibrate
```

Pure standard library. No numpy, no pandas, no plotting stack. A calibration
check that needs a build toolchain is a calibration check that does not get run.

## Measure

```python
from jevkit_core import read_records
from jevkit_calibrate import calibrate, observations_from_records

observations = observations_from_records(read_records("labeled.jevl"))
report = calibrate(observations)

print(report.summary())
print(report.diagram())
```

```
observations: 4000
accuracy:     0.7485
mean claimed: 0.7469  (underconfident by 0.0016)
ECE:          0.0094  (over 10 bins)
MCE:          0.0167
Brier:        0.1681
log loss:     0.5043
```

`ECE` is the average gap between claimed and observed, weighted by how many
observations fall in each bin. `MCE` is the worst gap in any one bin, which is
what catches a healthy-looking ECE hiding one badly wrong region. `Brier` and
`log loss` are proper scoring rules: they reward being calibrated **and**
decisive, so a model that always says 0.5 scores badly even though it is
perfectly calibrated.

## Pick a threshold

TypeSafe's confidence page recommends three bands and says where you draw them
depends on your data. This draws them from the data.

```python
from jevkit_calibrate import recommend_for_accuracy

point = recommend_for_accuracy(observations, target_accuracy=0.95)
if point is None:
    print("no threshold reaches 95% on this data")
else:
    print(f"threshold {point.threshold:.2f}: "
          f"covers {point.coverage:.1%} at {point.accuracy:.1%}, "
          f"{point.errors} wrong answers acted on")
```

`None` is a real answer, not a failure. It means this question cannot be
automated at that bar, and the honest move is to change the question rather
than lower the threshold.

## CLI

```bash
jevkit-calibrate labeled.jevl
jevkit-calibrate labeled.jevl --target-accuracy 0.95
jevkit-calibrate labeled.jevl --min-coverage 0.80
jevkit-calibrate labeled.jevl --max-ece 0.05     # CI gate
jevkit-calibrate labeled.jevl --format json
```

## Which quantity gets calibrated

By default, the probability mass on the chosen outcome, which is what "when it
says 0.8, is it right 80% of the time" means.

`--use-confidence` calibrates the API's `confidence` statistic instead. That is
a different question, and the one to ask when you want to know whether your
*routing* threshold sits in the right place. Nouls carry no confidence, so they
fall back to probability either way.

## License

MIT
