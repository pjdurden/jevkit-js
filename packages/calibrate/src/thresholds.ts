/**
 * Choosing a confidence threshold from labeled data instead of guessing.
 *
 * TypeSafe's confidence page recommends three bands: act automatically, proceed
 * with caution, escalate. It also says plainly that where you draw those lines
 * depends on your domain and your data. This module draws them from the data.
 *
 * The trade is always the same. Raising the threshold means acting on fewer
 * cases but being right more often on the ones you do act on. That is a curve,
 * not a number, so `sweep` returns the whole curve and the `recommendFor*`
 * functions pick a point on it against a constraint you state.
 */

import type { Observation } from "./metrics.js";

/** What happens if you auto-handle everything at or above `threshold`. */
export class ThresholdPoint {
  constructor(
    readonly threshold: number,
    readonly covered: number,
    readonly total: number,
    readonly correct: number,
  ) {}

  /** Fraction of cases handled automatically. */
  get coverage(): number {
    return this.total ? this.covered / this.total : 0;
  }

  /**
   * Accuracy on the automatically handled cases.
   *
   * Defined as 1 when nothing is covered: a threshold that acts on nothing is
   * never wrong. Read it together with `coverage`, never alone.
   */
  get accuracy(): number {
    return this.covered ? this.correct / this.covered : 1;
  }

  get escalated(): number {
    return this.total - this.covered;
  }

  /** Wrong answers you acted on. Usually the number that actually costs. */
  get errors(): number {
    return this.covered - this.correct;
  }
}

/**
 * Coverage and accuracy at every threshold from 0 to 1.
 *
 * Uses the probability the model put on the outcome it chose, so this works for
 * Choice and Score confidence and for a Noul's distance from 0.5 alike, as long
 * as the caller is consistent about which it fed in.
 */
export function sweep(observations: Observation[], steps = 101): ThresholdPoint[] {
  if (steps < 2) throw new RangeError("steps must be at least 2");
  const total = observations.length;
  const points: ThresholdPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const threshold = i / (steps - 1);
    const covered = observations.filter((o) => o.probability >= threshold);
    points.push(
      new ThresholdPoint(
        threshold,
        covered.length,
        total,
        covered.filter((o) => o.correct).length,
      ),
    );
  }
  return points;
}

/**
 * Lowest threshold reaching `targetAccuracy`, so coverage stays highest.
 *
 * Returns `null` when no threshold reaches the target, which is a real answer:
 * it means this question cannot be automated at that accuracy and the honest
 * move is to change the question rather than the threshold.
 */
export function recommendForAccuracy(
  observations: Observation[],
  targetAccuracy: number,
  steps = 101,
): ThresholdPoint | null {
  if (!(targetAccuracy >= 0 && targetAccuracy <= 1)) {
    throw new RangeError("targetAccuracy must be in [0, 1]");
  }
  const candidates = sweep(observations, steps).filter(
    (p) => p.covered > 0 && p.accuracy >= targetAccuracy,
  );
  if (!candidates.length) return null;
  return candidates.reduce((best, p) => (p.threshold < best.threshold ? p : best));
}

/**
 * Highest threshold still covering `minCoverage`, so accuracy is best.
 *
 * The mirror of `recommendForAccuracy`: use it when throughput is the binding
 * constraint and you want the most accurate threshold that still keeps enough
 * volume out of the review queue.
 */
export function recommendForCoverage(
  observations: Observation[],
  minCoverage: number,
  steps = 101,
): ThresholdPoint | null {
  if (!(minCoverage >= 0 && minCoverage <= 1)) {
    throw new RangeError("minCoverage must be in [0, 1]");
  }
  const candidates = sweep(observations, steps).filter((p) => p.coverage >= minCoverage);
  if (!candidates.length) return null;
  return candidates.reduce((best, p) => (p.threshold > best.threshold ? p : best));
}
