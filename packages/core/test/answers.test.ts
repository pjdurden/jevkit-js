import { describe, expect, it } from "vitest";
import { parseAnswer, parseAnswers } from "../src/answers.js";

const CHOICE = { type: "choice", choice: "billing",
  probabilities: { billing: 0.7, technical: 0.3 }, confidence: 0.55 };
const SCORE = { type: "score", score: 1.03,
  probabilities: { "0": 0.1, "1": 0.8, "2": 0.1 }, confidence: 0.84 };
const NOUL = { type: "noul", noul: 0.99 };

it("choice predicts its selection", () => {
  const a = parseAnswer("q", CHOICE);
  expect(a.predicted()).toBe("billing");
  expect(a.probabilityOf("billing")).toBe(0.7);
  expect(a.isCorrect("billing")).toBe(true);
  expect(a.isCorrect("technical")).toBe(false);
});

it("noul predicts a boolean against the threshold", () => {
  expect(parseAnswer("q", NOUL).predicted()).toBe(true);
  expect(parseAnswer("q", { type: "noul", noul: 0.2 }).predicted()).toBe(false);
  expect(parseAnswer("q", { type: "noul", noul: 0.5 }).predicted()).toBe(true);
});

it("noul synthesizes a two-outcome distribution", () => {
  const probs = parseAnswer("q", NOUL).probabilities;
  expect(probs["true"]).toBe(0.99);
  expect(probs["false"]).toBeCloseTo(0.01, 10);
});

it("noul has no confidence but has decisiveness", () => {
  const a = parseAnswer("q", NOUL);
  expect(a.confidence).toBeNull();
  expect(a.decisiveness).toBeCloseTo(0.98, 10);
});

it("score predicts the most probable level, not the rounded score", () => {
  const a = parseAnswer("q", { type: "score", score: 1.03,
    probabilities: { "0": 0.45, "1": 0.1, "2": 0.45 } });
  expect(a.predicted()).toBe(0);
  expect(parseAnswer("q", SCORE).predicted()).toBe(1);
});

it("score compares against an integer label", () => {
  expect(parseAnswer("q", SCORE).isCorrect(1)).toBe(true);
  expect(parseAnswer("q", SCORE).isCorrect(2)).toBe(false);
});

it("probability of an unoffered outcome is zero", () => {
  expect(parseAnswer("q", CHOICE).probabilityOf("sales")).toBe(0);
});

it("top probability is the mass on the prediction", () => {
  expect(parseAnswer("q", CHOICE).topProbability).toBe(0.7);
});

it("infers the type when the discriminator is missing", () => {
  expect(parseAnswer("q", { choice: "a", probabilities: { a: 1 } }).type).toBe("choice");
  expect(parseAnswer("q", { noul: 0.4 }).type).toBe("noul");
});

it("raises on an unrecognisable answer", () => {
  expect(() => parseAnswer("q", { mystery: 1 })).toThrow(/cannot determine type/);
});

it("maps every question", () => {
  expect(Object.keys(parseAnswers({ a: CHOICE, b: NOUL })).sort()).toEqual(["a", "b"]);
});
