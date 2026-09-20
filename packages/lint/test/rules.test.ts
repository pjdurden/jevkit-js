/** One test per rule: a case that must fire, and a near-miss that must not. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { allCodes } from "../src/rules.js";
import { lint } from "../src/linter.js";

const codes = (questions: Record<string, unknown>, state: unknown = "") =>
  lint(questions, { state }).diagnostics.map((d) => d.code);

const noul = (instructions: string, extra: Record<string, unknown> = {}) =>
  ({ type: "noul", instructions, ...extra });
const choice = (instructions: string, criteria: Record<string, unknown>) =>
  ({ type: "choice", instructions, criteria });
const score = (instructions: string, criteria: unknown[]) =>
  ({ type: "score", instructions, criteria });

const GOOD = choice("Which team should handle this request", {
  billing: "Payment or subscription issues",
  technical: "Bugs or integration problems",
  unknown: "None of the above applies",
});

it("leaves a well-formed question alone", () => {
  expect(codes({ ok: GOOD })).toEqual([]);
});

describe("JEV001 math and counting", () => {
  it.each([
    "How many invoices are attached",
    "Count the number of mentions",
    "What is the average order value",
    "Calculate the outstanding balance",
  ])("fires on %s", (text) => {
    expect(codes({ q: noul(text) })).toContain("JEV001");
  });

  it("ignores semantic questions", () => {
    expect(codes({ q: noul("Does the customer mention a billing problem") })).not.toContain("JEV001");
  });
});

describe("JEV002 date comparison", () => {
  it.each([
    "Which date came first",
    "Was the invoice sent within 30 days",
    "How long between the two events",
    "Is the subscription overdue",
  ])("fires on %s", (text) => {
    expect(codes({ q: noul(text) })).toContain("JEV002");
  });

  it("ignores date extraction", () => {
    expect(codes({
      q: choice("Which month is named in the message", {
        january: "January", february: "February", not_stated: "No month named",
      }),
    })).not.toContain("JEV002");
  });
});

describe("JEV003 generation", () => {
  it.each([
    "Summarize the complaint",
    "Write a reply to the customer",
    "Explain why the charge failed",
    "Translate the message",
  ])("fires on %s", (text) => {
    expect(codes({ q: noul(text) })).toContain("JEV003");
  });
});

describe("JEV004 negation", () => {
  it("fires on a double negative", () => {
    expect(codes({ q: noul("The request does not fail to mention a refund, unless it is absent") }))
      .toContain("JEV004");
  });

  it("flags a single negation on a Noul as info only", () => {
    const [diag] = lint({ q: noul("The message is not a refund request") })
      .diagnostics.filter((d) => d.code === "JEV004");
    expect(diag!.severity).toBe("info");
  });
});

describe("JEV005 vague scoping", () => {
  it("fires when a vague word has no criteria", () => {
    expect(codes({ q: noul("The passage is relevant") })).toContain("JEV005");
  });

  it("is satisfied by criteria", () => {
    expect(codes({
      q: noul("The passage is relevant", {
        criteria: { true: "It answers the user's question directly", false: "It does not answer the question" },
      }),
    })).not.toContain("JEV005");
  });
});

it("JEV006 fires on multi-hop instructions", () => {
  expect(codes({ q: noul("Check the owner of the parent of the account") })).toContain("JEV006");
});

describe("JEV007 noul polarity", () => {
  it("fires on inverted criteria", () => {
    expect(codes({
      q: noul("Refund requested", {
        criteria: { true: "No refund was requested", false: "Yes a refund was requested" },
      }),
    })).toContain("JEV007");
  });

  it("accepts aligned criteria", () => {
    expect(codes({
      q: noul("Refund requested", {
        criteria: { true: "Yes, a refund is requested", false: "No refund is requested" },
      }),
    })).not.toContain("JEV007");
  });
});

describe("JEV008 choice no-match", () => {
  it("fires when no option means none", () => {
    expect(codes({ q: choice("Pick a team", { a: "Team A", b: "Team B" }) })).toContain("JEV008");
  });

  it("accepts an explicit escape hatch", () => {
    expect(codes({ q: GOOD })).not.toContain("JEV008");
  });
});

describe("JEV009 choice arity", () => {
  it("fires on a single-option choice", () => {
    expect(codes({ q: choice("Pick one", { only: "The only option" }) })).toContain("JEV009");
  });

  it("fires on an empty choice", () => {
    expect(codes({ q: choice("Pick one", {}) })).toContain("JEV009");
  });
});

it("JEV010 fires on blank option descriptions", () => {
  expect(codes({ q: choice("Pick a team", { a: "", b: "Team B", other: "None" }) })).toContain("JEV010");
});

describe("JEV011 score levels", () => {
  it("fires on bare labels", () => {
    expect(codes({ q: score("How frustrated", ["low", "medium", "high"]) })).toContain("JEV011");
  });

  it("accepts descriptive levels", () => {
    expect(codes({
      q: score("How frustrated the customer appears",
        ["Calm, just stating facts", "Frustrated but civil", "Very angry, strong language"]),
    })).not.toContain("JEV011");
  });

  it("fires on a one-level scale", () => {
    expect(codes({ q: score("How frustrated", ["Calm and stating facts"]) })).toContain("JEV011");
  });
});

describe("JEV012 instructions", () => {
  it("fires on missing instructions", () => {
    expect(codes({ q: noul("") })).toContain("JEV012");
  });

  it("fires on terse instructions", () => {
    expect(codes({ q: noul("urgent?") })).toContain("JEV012");
  });
});

describe("JEV013 question id references", () => {
  it("fires when one question names another by id", () => {
    expect(codes({
      is_refund: noul("The message requests a refund"),
      amount: noul("If is_refund is true, an amount is stated"),
    })).toContain("JEV013");
  });

  it("ignores backticked state paths", () => {
    expect(codes({
      ticket: noul("The message requests a refund"),
      amount: noul("An amount is stated in `ticket.messages[0].text`"),
    })).not.toContain("JEV013");
  });
});

it("JEV014 fires when state exceeds its budget", () => {
  expect(codes({ q: noul("Is this relevant to billing") }, "x".repeat(200_000))).toContain("JEV014");
});

it("JEV015 fires when the request exceeds the total budget", () => {
  const questions: Record<string, unknown> = {};
  for (let i = 0; i < 120; i++) questions[`q${i}`] = noul("y".repeat(3000));
  expect(codes(questions, "s")).toContain("JEV015");
});

it("JEV016 flags a noisy state without erroring", () => {
  const [diag] = lint({ q: noul("Is this about billing") }, { state: "x".repeat(40_000) })
    .diagnostics.filter((d) => d.code === "JEV016");
  expect(diag!.severity).toBe("info");
});

it("JEV017 fires on hex colours", () => {
  expect(codes({ q: noul("Is #ff0000 close to the brand colour") })).toContain("JEV017");
});

it("JEV018 flags identical questions", () => {
  expect(codes({
    a: noul("The message requests a refund"),
    b: noul("The message requests a refund"),
  })).toContain("JEV018");
});

it("has a test for every registered code", () => {
  const source = readFileSync(new URL(import.meta.url), "utf8");
  for (const code of allCodes()) {
    expect(source, `${code} has no test`).toContain(code);
  }
});
