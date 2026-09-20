import { describe, expect, it } from "vitest";
import { STATE_BUDGET, checkBudget, estimateTokens } from "../src/tokens.js";

describe("token budgets", () => {
  it("grows with length", () => {
    expect(estimateTokens("a".repeat(1000))).toBeGreaterThan(estimateTokens("a".repeat(10)));
  });

  it("is never zero", () => {
    expect(estimateTokens("")).toBeGreaterThanOrEqual(1);
  });

  it("passes a small request", () => {
    const r = checkBudget("short state", { q: { type: "noul", instructions: "ok?" } });
    expect(r.overState).toBe(false);
    expect(r.overTotal).toBe(false);
  });

  it("trips the state budget on an oversized state", () => {
    const r = checkBudget("x".repeat(STATE_BUDGET * 4), { q: { type: "noul", instructions: "ok?" } });
    expect(r.overState).toBe(true);
  });

  it("trips the total budget on many questions", () => {
    const questions: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) questions[`q${i}`] = { type: "noul", instructions: "y".repeat(2000) };
    expect(checkBudget("s", questions).overTotal).toBe(true);
  });

  it("identifies the longest question", () => {
    const r = checkBudget("s", {
      small: { type: "noul", instructions: "a" },
      big: { type: "noul", instructions: "a".repeat(500) },
    });
    expect(r.longestQuestionId).toBe("big");
  });

  it("handles an empty question set", () => {
    const r = checkBudget("s", {});
    expect(r.longestQuestionId).toBeNull();
    expect(r.longestPair).toBe(r.stateTokens);
  });
});
