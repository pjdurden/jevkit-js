/**
 * Calibration metrics over labeled jev answers.
 *
 * Calibration is Jev's central claim: the probabilities are meant to reflect
 * real-world frequencies, so that among answers given 0.8, about 80% are right.
 * TypeSafe measures this across groups of predictions and says plainly that it
 * does not guarantee any individual answer. This module is how you check the
 * claim on *your* data, which is the part nobody else can do for you.
 *
 * Everything here is pure arithmetic over recorded answers. Nothing calls the
 * API and there are no dependencies: a calibration check that drags in a
 * numerical stack is a calibration check that does not get run.
 */

export interface ObservationInit {
  probability: number;
  correct: boolean;
  questionId?: string;
  requestId?: string;
}

/**
 * One labeled prediction.
 *
 * `probability` is the model's stated probability for the outcome it chose;
 * `correct` is whether that outcome matched the label.
 */
export class Observation {
  readonly probability: number;
  readonly correct: boolean;
  readonly questionId: string;
  readonly requestId: string;

  constructor(init: ObservationInit) {
    if (!(init.probability >= 0 && init.probability <= 1)) {
      throw new RangeError(`probability must be in [0, 1], got ${init.probability}`);
    }
    this.probability = init.probability;
    this.correct = init.correct;
    this.questionId = init.questionId ?? "";
    this.requestId = init.requestId ?? "";
  }
}

/** One bucket of a reliability diagram. */
export class Bin {
  readonly observations: Observation[] = [];

  constructor(readonly lower: number, readonly upper: number) {}

  get count(): number {
    return this.observations.length;
  }

  /** What the model claimed, on average. */
  get meanProbability(): number {
    if (!this.count) return 0;
    return this.observations.reduce((a, o) => a + o.probability, 0) / this.count;
  }

  /** What actually happened. */
  get accuracy(): number {
    if (!this.count) return 0;
    return this.observations.filter((o) => o.correct).length / this.count;
  }

  /** Claimed minus observed. Positive means overconfident. */
  get gap(): number {
    return this.meanProbability - this.accuracy;
  }

  label(): string {
    return `[${this.lower.toFixed(2)}, ${this.upper.toFixed(2)}${this.upper === 1 ? "]" : ")"}`;
  }
}

/**
 * Bucket observations into equal-width probability bins.
 *
 * Equal-width rather than equal-count, because the question being asked is
 * "when the model says 0.9, is it right 90% of the time", and that question is
 * about fixed probability ranges. Empty bins are kept so the diagram does not
 * silently mislead about coverage.
 */
export function reliabilityBins(observations: Observation[], nBins = 10): Bin[] {
  if (nBins < 1) throw new RangeError("nBins must be at least 1");
  const bins: Bin[] = [];
  for (let i = 0; i < nBins; i++) bins.push(new Bin(i / nBins, (i + 1) / nBins));
  for (const obs of observations) {
    // The top bin is closed so a probability of exactly 1 lands in it.
    const index = Math.min(Math.floor(obs.probability * nBins), nBins - 1);
    bins[index]!.observations.push(obs);
  }
  return bins;
}

/**
 * ECE: average gap between claimed and observed, weighted by bin population.
 *
 * 0 is perfect. ECE depends on the bin count, so compare values only when they
 * were computed with the same `nBins`.
 */
export function expectedCalibrationError(observations: Observation[], nBins = 10): number {
  if (!observations.length) return 0;
  const total = observations.length;
  return reliabilityBins(observations, nBins)
    .filter((b) => b.count)
    .reduce((sum, b) => sum + (b.count / total) * Math.abs(b.gap), 0);
}

/**
 * MCE: the worst gap in any populated bin.
 *
 * ECE can look healthy while one region is badly wrong. MCE catches that, and
 * it is the number that matters when one region is where your high-stakes
 * decisions live.
 */
export function maximumCalibrationError(observations: Observation[], nBins = 10): number {
  if (!observations.length) return 0;
  const populated = reliabilityBins(observations, nBins).filter((b) => b.count);
  return populated.reduce((m, b) => Math.max(m, Math.abs(b.gap)), 0);
}

/**
 * Mean squared error between probability and outcome. Lower is better.
 *
 * Unlike ECE this is a proper scoring rule: it rewards being both calibrated
 * and decisive, so a model that always says 0.5 scores poorly even though it is
 * perfectly calibrated.
 */
export function brierScore(observations: Observation[]): number {
  if (!observations.length) return 0;
  return (
    observations.reduce((sum, o) => sum + (o.probability - (o.correct ? 1 : 0)) ** 2, 0) /
    observations.length
  );
}

/**
 * Mean negative log likelihood. Lower is better.
 *
 * Punishes confident mistakes far harder than Brier does. `eps` clamps the
 * probability away from 0 and 1, since an unclamped confident miss is infinite
 * and would swamp every other observation.
 */
export function logLoss(observations: Observation[], eps = 1e-15): number {
  if (!observations.length) return 0;
  let total = 0;
  for (const o of observations) {
    const p = Math.min(Math.max(o.probability, eps), 1 - eps);
    total -= o.correct ? Math.log(p) : Math.log(1 - p);
  }
  return total / observations.length;
}

export class CalibrationReport {
  constructor(readonly observations: Observation[], readonly nBins = 10) {}

  get count(): number {
    return this.observations.length;
  }

  get accuracy(): number {
    if (!this.count) return 0;
    return this.observations.filter((o) => o.correct).length / this.count;
  }

  get meanProbability(): number {
    if (!this.count) return 0;
    return this.observations.reduce((a, o) => a + o.probability, 0) / this.count;
  }

  get bins(): Bin[] {
    return reliabilityBins(this.observations, this.nBins);
  }

  get ece(): number {
    return expectedCalibrationError(this.observations, this.nBins);
  }

  get mce(): number {
    return maximumCalibrationError(this.observations, this.nBins);
  }

  get brier(): number {
    return brierScore(this.observations);
  }

  get logLoss(): number {
    return logLoss(this.observations);
  }

  /** Claimed probability exceeds observed accuracy overall. */
  get overconfident(): boolean {
    return this.meanProbability > this.accuracy;
  }

  /**
   * A text reliability diagram.
   *
   * Each row shows a bin's claimed probability against what actually happened,
   * so a miscalibrated region is visible without plotting.
   */
  diagram(width = 28): string {
    const lines = [
      `${"bin".padEnd(14)} ${"n".padStart(5)} ${"claimed".padStart(8)} ` +
        `${"actual".padStart(8)} ${"gap".padStart(7)}`,
      "-".repeat(46),
    ];
    for (const b of this.bins) {
      if (!b.count) {
        lines.push(
          `${b.label().padEnd(14)} ${String(0).padStart(5)} ${"-".padStart(8)} ` +
            `${"-".padStart(8)} ${"-".padStart(7)}`,
        );
        continue;
      }
      const barLen = Math.floor(b.accuracy * width);
      const marker = Math.floor(b.meanProbability * width);
      const cells: string[] = Array.from({ length: width }, (_, i) => (i < barLen ? "#" : " "));
      if (marker >= 0 && marker < width) cells[marker] = cells[marker] === " " ? "|" : "+";
      const gap = `${b.gap >= 0 ? "+" : ""}${b.gap.toFixed(3)}`;
      lines.push(
        `${b.label().padEnd(14)} ${String(b.count).padStart(5)} ` +
          `${b.meanProbability.toFixed(3).padStart(8)} ${b.accuracy.toFixed(3).padStart(8)} ` +
          `${gap.padStart(7)}  ${cells.join("")}`,
      );
    }
    lines.push("", "  # observed accuracy, | claimed probability, + both");
    return lines.join("\n");
  }

  summary(): string {
    if (!this.count) return "no labeled observations";
    const direction = this.overconfident ? "overconfident" : "underconfident";
    const gap = Math.abs(this.meanProbability - this.accuracy);
    return [
      `observations: ${this.count}`,
      `accuracy:     ${this.accuracy.toFixed(4)}`,
      `mean claimed: ${this.meanProbability.toFixed(4)}  (${direction} by ${gap.toFixed(4)})`,
      `ECE:          ${this.ece.toFixed(4)}  (over ${this.nBins} bins)`,
      `MCE:          ${this.mce.toFixed(4)}`,
      `Brier:        ${this.brier.toFixed(4)}`,
      `log loss:     ${this.logLoss.toFixed(4)}`,
    ].join("\n");
  }

  toJSON() {
    return {
      count: this.count,
      accuracy: this.accuracy,
      meanProbability: this.meanProbability,
      overconfident: this.overconfident,
      ece: this.ece,
      mce: this.mce,
      brier: this.brier,
      logLoss: this.logLoss,
      nBins: this.nBins,
      bins: this.bins.map((b) => ({
        lower: b.lower, upper: b.upper, count: b.count,
        meanProbability: b.meanProbability, accuracy: b.accuracy, gap: b.gap,
      })),
    };
  }
}

export function calibrate(observations: Iterable<Observation>, nBins = 10): CalibrationReport {
  return new CalibrationReport([...observations], nBins);
}
