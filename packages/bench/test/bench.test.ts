import { expect, it } from "vitest";
import { Record as JevlRecord } from "@jevkit/core";
import { compareSuites, scoreRecords } from "../src/index.js";

function rec(choice: string, label: string, opts: {
  probs?: Record<string, number>; state?: string;
  usage?: Record<string, unknown> | null; tags?: string[];
} = {}) {
  return new JevlRecord({
    model: "jev-1.13.0", state: opts.state ?? "s",
    questions: { team: { type: "choice", instructions: "Which team" } },
    answers: { team: { type: "choice", choice,
      probabilities: opts.probs ?? { [choice]: 1 }, confidence: 0.9 } },
    label: { team: label }, usage: opts.usage ?? null, tags: opts.tags ?? [],
  });
}

it("counts matches as accuracy", () => {
  const suite = scoreRecords([rec("a", "a"), rec("b", "a", { state: "t" })]);
  expect(suite.count).toBe(2);
  expect(suite.correct).toBe(1);
  expect(suite.accuracy).toBe(0.5);
});

it("counts and skips unlabeled records", () => {
  const unlabeled = new JevlRecord({ model: "m", state: "u",
    questions: { q: { type: "noul" } }, answers: { q: { type: "noul", noul: 0.9 } } });
  const suite = scoreRecords([rec("a", "a"), unlabeled]);
  expect(suite.records).toBe(2);
  expect(suite.unlabeled).toBe(1);
  expect(suite.count).toBe(1);
});

it("bills input tokens only", () => {
  const suite = scoreRecords([
    rec("a", "a", { usage: { input_tokens: 1_000_000, output_tokens: 500_000 } }),
  ]);
  expect(suite.inputTokens).toBe(1_000_000);
  expect(suite.outputTokens).toBe(500_000);
  expect(suite.cost).toBeCloseTo(0.042, 10);
});

it("respects a price override", () => {
  const suite = scoreRecords([rec("a", "a", { usage: { input_tokens: 1_000_000 } })],
    { pricePerMtok: 1 });
  expect(suite.cost).toBeCloseTo(1, 10);
});

it("sorts failures most confident first", () => {
  const suite = scoreRecords([
    rec("b", "a", { probs: { b: 0.6, a: 0.4 }, state: "one" }),
    rec("b", "a", { probs: { b: 0.99, a: 0.01 }, state: "two" }),
  ]);
  expect(suite.failures().map((f) => Number(f.probability.toFixed(2)))).toEqual([0.99, 0.6]);
});

it("buckets results by tag", () => {
  const suite = scoreRecords([
    rec("a", "a", { tags: ["routing"] }),
    rec("b", "a", { state: "t", tags: ["routing"] }),
  ]);
  expect(suite.byTag()["routing"]).toEqual([2, 0.5]);
});

it("finds the weak question", () => {
  const good = new JevlRecord({ model: "m", state: "s",
    questions: { a: { type: "noul" }, b: { type: "noul" } },
    answers: { a: { type: "noul", noul: 0.9 }, b: { type: "noul", noul: 0.9 } },
    label: { a: true, b: false } });
  const byQ = scoreRecords([good]).byQuestion();
  expect(byQ["a"]).toEqual([1, 1]);
  expect(byQ["b"]).toEqual([1, 0]);
});

it("tracks regressions and fixes separately from aggregate accuracy", () => {
  const baseline = scoreRecords([rec("a", "a", { state: "one" }), rec("b", "a", { state: "two" })]);
  const candidate = scoreRecords([rec("b", "a", { state: "one" }), rec("a", "a", { state: "two" })]);
  const comparison = compareSuites(baseline, candidate);
  expect(comparison.accuracyDelta).toBe(0);
  expect(comparison.regressions).toHaveLength(1);
  expect(comparison.fixes).toHaveLength(1);
});

it("reports zero on an empty suite rather than dividing by zero", () => {
  const suite = scoreRecords([]);
  expect(suite.accuracy).toBe(0);
  expect(suite.costPerQuestion).toBe(0);
});
