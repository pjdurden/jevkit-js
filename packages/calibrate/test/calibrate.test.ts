import { expect, it } from "vitest";
import { Record as JevlRecord } from "@jevkit/core";
import {
  Observation, brierScore, calibrate, expectedCalibrationError, logLoss,
  maximumCalibrationError, observationsFromRecords, recommendForAccuracy,
  recommendForCoverage, sweep,
} from "../src/index.js";

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function perfect(n = 2000, seed = 1): Observation[] {
  const rng = mulberry(seed);
  return Array.from({ length: n }, () => {
    const p = 0.5 + rng() * 0.5;
    return new Observation({ probability: p, correct: rng() < p });
  });
}

it("rejects a probability outside the unit interval", () => {
  for (const bad of [-0.1, 1.1]) {
    expect(() => new Observation({ probability: bad, correct: true })).toThrow(RangeError);
  }
});

it("a perfectly calibrated generator has near-zero ECE", () => {
  expect(expectedCalibrationError(perfect())).toBeLessThan(0.05);
});

it("a maximally overconfident model has ECE near one", () => {
  const obs = Array.from({ length: 100 }, () => new Observation({ probability: 1, correct: false }));
  expect(expectedCalibrationError(obs)).toBeCloseTo(1, 10);
});

it("MCE catches one bad region that ECE dilutes", () => {
  const good = Array.from({ length: 998 }, (_, i) =>
    new Observation({ probability: 0.5, correct: i % 2 === 0 }));
  const bad = Array.from({ length: 2 }, () => new Observation({ probability: 1, correct: false }));
  const obs = [...good, ...bad];
  expect(expectedCalibrationError(obs)).toBeLessThan(0.01);
  expect(maximumCalibrationError(obs)).toBeCloseTo(1, 10);
});

it("Brier rewards being decisive as well as calibrated", () => {
  const alwaysHalf = Array.from({ length: 100 }, (_, i) =>
    new Observation({ probability: 0.5, correct: i % 2 === 0 }));
  const decisive = Array.from({ length: 100 }, () =>
    new Observation({ probability: 1, correct: true }));
  expect(brierScore(decisive)).toBeLessThan(brierScore(alwaysHalf));
});

it("log loss is finite on a confident miss", () => {
  expect(logLoss([new Observation({ probability: 1, correct: false })])).toBeLessThan(Infinity);
});

it("empty input produces zeros, not errors", () => {
  expect(expectedCalibrationError([])).toBe(0);
  expect(brierScore([])).toBe(0);
  expect(calibrate([]).summary()).toBe("no labeled observations");
});

it("bins cover the unit interval and include 1.0", () => {
  const populated = calibrate([new Observation({ probability: 1, correct: true })]).bins
    .filter((b) => b.count);
  expect(populated).toHaveLength(1);
  expect(populated[0]!.upper).toBe(1);
});

it("keeps empty bins so coverage is visible", () => {
  const report = calibrate([new Observation({ probability: 0.95, correct: true })]);
  expect(report.bins).toHaveLength(10);
  expect(report.bins.filter((b) => b.count === 0)).toHaveLength(9);
});

it("detects overconfidence", () => {
  const obs = Array.from({ length: 100 }, (_, i) =>
    new Observation({ probability: 0.9, correct: i < 50 }));
  expect(calibrate(obs).overconfident).toBe(true);
});

it("renders a diagram without a plotting library", () => {
  const out = calibrate(perfect(200)).diagram();
  expect(out).toContain("claimed");
  expect(out).toContain("actual");
});

it("sweep is monotone in coverage", () => {
  const coverages = sweep(perfect(500)).map((p) => p.coverage);
  expect(coverages).toEqual([...coverages].sort((a, b) => b - a));
});

it("picks the lowest threshold reaching the target accuracy", () => {
  const obs = perfect(3000);
  const point = recommendForAccuracy(obs, 0.85);
  expect(point).not.toBeNull();
  expect(point!.accuracy).toBeGreaterThanOrEqual(0.85);
  const lower = sweep(obs).filter((p) => p.threshold < point!.threshold && p.covered > 0);
  expect(lower.every((p) => p.accuracy < 0.85)).toBe(true);
});

it("returns null for an unreachable accuracy rather than a bad threshold", () => {
  const obs = Array.from({ length: 100 }, () =>
    new Observation({ probability: 0.6, correct: false }));
  expect(recommendForAccuracy(obs, 0.99)).toBeNull();
});

it("picks the highest threshold meeting the coverage floor", () => {
  const point = recommendForCoverage(perfect(1000), 0.5);
  expect(point).not.toBeNull();
  expect(point!.coverage).toBeGreaterThanOrEqual(0.5);
});

it("accuracy is 1 when nothing is covered", () => {
  const obs = [new Observation({ probability: 0.1, correct: false })];
  const top = sweep(obs).at(-1)!;
  expect(top.covered).toBe(0);
  expect(top.accuracy).toBe(1);
});

it("skips records without labels", () => {
  const unlabeled = new JevlRecord({ model: "m", state: "s",
    questions: { q: { type: "noul" } }, answers: { q: { type: "noul", noul: 0.9 } } });
  expect(observationsFromRecords([unlabeled])).toEqual([]);
});

it("extracts observations from labeled records", () => {
  const labeled = new JevlRecord({ model: "m", state: "s",
    questions: { q: { type: "choice" } },
    answers: { q: { type: "choice", choice: "a",
      probabilities: { a: 0.8, b: 0.2 }, confidence: 0.6 } },
    label: { q: "a" } });
  const [obs] = observationsFromRecords([labeled]);
  expect(obs!.correct).toBe(true);
  expect(obs!.probability).toBeCloseTo(0.8, 10);
});

it("useConfidence selects the other quantity", () => {
  const labeled = new JevlRecord({ model: "m", state: "s",
    questions: { q: { type: "choice" } },
    answers: { q: { type: "choice", choice: "a",
      probabilities: { a: 0.8, b: 0.2 }, confidence: 0.6 } },
    label: { q: "a" } });
  const [obs] = observationsFromRecords([labeled], { useConfidence: true });
  expect(obs!.probability).toBeCloseTo(0.6, 10);
});
