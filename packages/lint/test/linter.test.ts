import { describe, expect, it } from "vitest";
import { lint } from "../src/linter.js";

const counting = { q: { type: "noul", instructions: "How many items are there" } };

it("select runs only the named rules", () => {
  expect(lint(counting, { select: ["JEV001"] }).diagnostics.map((d) => d.code)).toEqual(["JEV001"]);
  expect(lint(counting, { select: ["JEV002"] }).diagnostics).toEqual([]);
});

it("ignore suppresses a rule", () => {
  expect(lint(counting, { ignore: ["JEV001"] }).diagnostics.map((d) => d.code)).not.toContain("JEV001");
});

it("sorts results most severe first", () => {
  const result = lint({
    gen: { type: "noul", instructions: "Summarize this" },
    ch: { type: "choice", instructions: "Pick a team", criteria: { a: "Team A", b: "Team B" } },
  });
  const rank = { error: 0, warning: 1, info: 2 } as const;
  const seen = result.diagnostics.map((d) => rank[d.severity]);
  expect(seen).toEqual([...seen].sort((a, b) => a - b));
});

it("is ok when only warnings are present", () => {
  const result = lint({ q: { type: "choice", instructions: "Pick a team", criteria: { a: "Team A", b: "Team B" } } });
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(result.ok).toBe(true);
});

it("is not ok when an error is present", () => {
  expect(lint(counting).ok).toBe(false);
});

it("raises a clear error on an unknown question type", () => {
  expect(() => lint({ q: { type: "mystery", instructions: "hello" } })).toThrow(/cannot determine type/);
});

it("accepts SDK-style class instances", () => {
  class Noul {
    constructor(public instructions: string, public criteria: unknown = null) {}
  }
  expect(lint({ q: new Noul("How many items are there") }).diagnostics.map((d) => d.code))
    .toContain("JEV001");
});

it("is JSON serializable", () => {
  expect(() => JSON.stringify(lint(counting).toJSON())).not.toThrow();
});

it("is iterable", () => {
  expect([...lint(counting)].length).toBeGreaterThan(0);
});
