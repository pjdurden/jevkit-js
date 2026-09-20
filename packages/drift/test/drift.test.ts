import { describe, expect, it } from "vitest";
import { Record as JevlRecord } from "@jevkit/core";
import { compareRecords, compareSets, replay, totalVariation } from "../src/index.js";

const QUESTIONS = { team: { type: "choice", instructions: "Which team" } };

function rec(model: string, choice: string, probs: Record<string, number>,
             confidence = 0.5, state = "s") {
  return new JevlRecord({
    model, state, questions: QUESTIONS,
    answers: { team: { type: "choice", choice, probabilities: probs, confidence } },
  });
}

it("total variation of identical distributions is zero", () => {
  expect(totalVariation({ a: 0.5, b: 0.5 }, { a: 0.5, b: 0.5 })).toBe(0);
});

it("total variation of disjoint distributions is one", () => {
  expect(totalVariation({ a: 1 }, { b: 1 })).toBeCloseTo(1, 10);
});

it("total variation counts outcomes missing from one side", () => {
  expect(totalVariation({ a: 1 }, { a: 0.5, b: 0.5 })).toBeCloseTo(0.5, 10);
});

it("a changed decision is a flip", () => {
  const delta = compareRecords(
    rec("jev-1.13.0", "billing", { billing: 0.7, technical: 0.3 }),
    rec("jev-1.14.0", "technical", { billing: 0.3, technical: 0.7 }),
  );
  expect(delta.flips).toHaveLength(1);
  expect(delta.questions[0]!.before).toBe("billing");
  expect(delta.questions[0]!.after).toBe("technical");
});

it("a moved distribution with the same decision is not a flip", () => {
  const delta = compareRecords(
    rec("jev-1.13.0", "billing", { billing: 0.9, technical: 0.1 }),
    rec("jev-1.14.0", "billing", { billing: 0.6, technical: 0.4 }),
  );
  expect(delta.flips).toHaveLength(0);
  expect(delta.maxShift).toBeCloseTo(0.3, 10);
});

it("reports the confidence delta", () => {
  const delta = compareRecords(
    rec("jev-1.13.0", "billing", { billing: 0.9 }, 0.8),
    rec("jev-1.14.0", "billing", { billing: 0.9 }, 0.5),
  );
  expect(delta.questions[0]!.confidenceDelta).toBeCloseTo(-0.3, 10);
});

it("refuses records for different requests", () => {
  expect(() =>
    compareRecords(rec("m", "a", { a: 1 }, 0.5, "one"), rec("m", "a", { a: 1 }, 0.5, "two")),
  ).toThrow(/different requests/);
});

it("refuses a changed answer type", () => {
  const before = new JevlRecord({ model: "m", state: "s", questions: QUESTIONS,
    answers: { team: { type: "choice", choice: "a", probabilities: { a: 1 } } } });
  const after = new JevlRecord({ model: "m", state: "s", questions: QUESTIONS,
    answers: { team: { type: "noul", noul: 1 } } });
  expect(() => compareRecords(before, after)).toThrow(/type changed/);
});

it("refuses a missing answer rather than ignoring it", () => {
  const after = new JevlRecord({ model: "m", state: "s", questions: QUESTIONS, answers: {} });
  expect(() => compareRecords(rec("m", "billing", { billing: 1 }), after))
    .toThrow(/missing in the new run/);
});

it("pairs sets on request id across model versions", () => {
  const report = compareSets(
    [rec("jev-1.13.0", "billing", { billing: 0.7, technical: 0.3 })],
    [rec("jev-1.14.0", "technical", { billing: 0.3, technical: 0.7 })],
  );
  expect(report.deltas).toHaveLength(1);
  expect(report.flips).toHaveLength(1);
  expect(report.flipRate).toBe(1);
});

it("reports unmatched records rather than silently dropping them", () => {
  const report = compareSets(
    [rec("m", "a", { a: 1 }, 0.5, "one")],
    [rec("m", "a", { a: 1 }, 0.5, "two")],
  );
  expect(report.deltas).toHaveLength(0);
  expect(report.unmatchedBefore).toHaveLength(1);
  expect(report.unmatchedAfter).toHaveLength(1);
});

it("replay carries labels and calls through", async () => {
  const baseline = [new JevlRecord({
    model: "jev-1.13.0", state: "s", questions: QUESTIONS,
    answers: { team: { type: "choice", choice: "billing", probabilities: { billing: 1 } } },
    label: { team: "billing" }, tags: ["routing"],
  })];
  const seen: unknown[] = [];
  const out = await replay(baseline, (state, questions) => {
    seen.push([state, questions]);
    return { model: "jev-1.14.0",
      answers: { team: { type: "choice", choice: "technical", probabilities: { technical: 1 } } },
      usage: { input_tokens: 5 } };
  });
  expect(seen).toHaveLength(1);
  expect(out[0]!.model).toBe("jev-1.14.0");
  expect(out[0]!.label).toEqual({ team: "billing" });
  expect(out[0]!.tags).toContain("routing");
  expect(out[0]!.requestId).toBe(baseline[0]!.requestId);
});
