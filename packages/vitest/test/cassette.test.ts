import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

import { readRecords } from "@jevkit/core";
import { Cassette, CassetteMiss, assertAnswer, assertConfident, describeAnswer } from "../src/index.js";

const QUESTIONS = { team: { type: "choice", instructions: "Which team handles this" } };
const STATE = "I was charged twice";
const LIVE = {
  model: "jev-1.13.0",
  answers: { team: { type: "choice", choice: "billing",
    probabilities: { billing: 0.9, technical: 0.1 }, confidence: 0.8 } },
  usage: { input_tokens: 12 },
};

const tmp = () => join(mkdtempSync(join(tmpdir(), "jevkit-")), "c.jevl");
const client = (calls: unknown[]) => (state: unknown, questions: unknown) => {
  calls.push([state, questions]);
  return LIVE;
};

it("replay mode throws on a miss", async () => {
  const cassette = new Cassette(tmp(), { mode: "replay" });
  await expect(cassette.systemOne(STATE, QUESTIONS)).rejects.toThrow(CassetteMiss);
});

it("auto mode records then replays", async () => {
  const path = tmp();
  const calls: unknown[] = [];
  await new Cassette(path, { systemOne: client(calls), mode: "auto" }).systemOne(STATE, QUESTIONS);
  expect(calls).toHaveLength(1);
  expect(existsSync(path)).toBe(true);

  const response = await new Cassette(path, { systemOne: client(calls), mode: "auto" })
    .systemOne(STATE, QUESTIONS) as { answers: Record<string, Record<string, unknown>> };
  expect(calls).toHaveLength(1);
  expect(response.answers["team"]!["choice"]).toBe("billing");
});

it("returns the live response unchanged while recording", async () => {
  const cassette = new Cassette(tmp(), { systemOne: client([]), mode: "auto" });
  expect(await cassette.systemOne(STATE, QUESTIONS)).toBe(LIVE);
});

it("treats a changed question as a miss", async () => {
  const path = tmp();
  await new Cassette(path, { systemOne: client([]), mode: "auto" }).systemOne(STATE, QUESTIONS);
  const reworded = { team: { type: "choice", instructions: "Which department handles this" } };
  await expect(new Cassette(path, { mode: "replay" }).systemOne(STATE, reworded))
    .rejects.toThrow(CassetteMiss);
});

it("record mode always calls through", async () => {
  const path = tmp();
  const calls: unknown[] = [];
  await new Cassette(path, { systemOne: client(calls), mode: "auto" }).systemOne(STATE, QUESTIONS);
  await new Cassette(path, { systemOne: client(calls), mode: "record" }).systemOne(STATE, QUESTIONS);
  expect(calls).toHaveLength(2);
});

it("passthrough never writes", async () => {
  const path = tmp();
  await new Cassette(path, { systemOne: client([]), mode: "passthrough" }).systemOne(STATE, QUESTIONS);
  expect(existsSync(path)).toBe(false);
});

it("explains itself when recording without a client", async () => {
  await expect(new Cassette(tmp(), { mode: "auto" }).systemOne(STATE, QUESTIONS))
    .rejects.toThrow(/no client was supplied/);
});

it("rejects an invalid mode", () => {
  expect(() => new Cassette(tmp(), { mode: "nonsense" as never })).toThrow(RangeError);
});

it("reports unplayed entries", async () => {
  const path = tmp();
  await new Cassette(path, { systemOne: client([]), mode: "auto" }).systemOne(STATE, QUESTIONS);
  const cassette = new Cassette(path, { mode: "replay" });
  expect(cassette.unplayed).toHaveLength(1);
  await cassette.systemOne(STATE, QUESTIONS);
  expect(cassette.unplayed).toEqual([]);
});

it("produces a valid jevl golden set", async () => {
  const path = tmp();
  await new Cassette(path, { systemOne: client([]), mode: "auto" }).systemOne(STATE, QUESTIONS);
  const [record] = readRecords(path);
  expect(record!.model).toBe("jev-1.13.0");
  expect(record!.usage).toEqual({ input_tokens: 12 });
});

it("reports membership", async () => {
  const path = tmp();
  const cassette = new Cassette(path, { systemOne: client([]), mode: "auto" });
  expect(cassette.contains(STATE, QUESTIONS)).toBe(false);
  await cassette.systemOne(STATE, QUESTIONS);
  expect(new Cassette(path, { mode: "replay" }).contains(STATE, QUESTIONS)).toBe(true);
});

it("records SDK-style class instances", async () => {
  class Answer {
    type = "choice"; choice = "billing";
    probabilities = { billing: 1 }; confidence = 0.9;
  }
  const path = tmp();
  await new Cassette(path, {
    systemOne: () => ({ model: "jev-1.13.0", answers: { team: new Answer() }, usage: null }),
    mode: "auto",
  }).systemOne(STATE, QUESTIONS);
  const [record] = readRecords(path);
  expect((record!.answers["team"] as Record<string, unknown>)["choice"]).toBe("billing");
});

it("replays under the same alias it recorded under", async () => {
  // Regression: the record stores the answering model (jev-1.13.0) while the
  // test asks for the alias (jev-latest). Indexing on the answering model made
  // every replay a miss.
  const path = tmp();
  const calls: unknown[] = [];
  await new Cassette(path, { systemOne: client(calls), mode: "auto", model: "jev-latest" })
    .systemOne(STATE, QUESTIONS);
  await new Cassette(path, { systemOne: client(calls), mode: "auto", model: "jev-latest" })
    .systemOne(STATE, QUESTIONS);
  expect(calls).toHaveLength(1);

  const [record] = readRecords(path);
  expect(record!.model).toBe("jev-1.13.0");
  expect(record!.meta["requested_model"]).toBe("jev-latest");
});

it("treats a different requested model as a separate entry", async () => {
  const path = tmp();
  const calls: unknown[] = [];
  await new Cassette(path, { systemOne: client(calls), mode: "auto", model: "jev-latest" })
    .systemOne(STATE, QUESTIONS);
  await new Cassette(path, { systemOne: client(calls), mode: "auto", model: "jev-1.14.0" })
    .systemOne(STATE, QUESTIONS);
  expect(calls).toHaveLength(2);
});

// -- assertions ------------------------------------------------------------

const CHOICE = { type: "choice", choice: "billing",
  probabilities: { billing: 0.55, technical: 0.45 }, confidence: 0.3 };
const NOUL = { type: "noul", noul: 0.99 };

it("passes a matching answer", () => {
  expect(() => assertAnswer(CHOICE, "billing")).not.toThrow();
});

it("reports the distribution on a mismatch", () => {
  expect(() => assertAnswer(CHOICE, "technical")).toThrow(/billing=0.550/);
});

it("catches a narrow win via minProbability", () => {
  expect(() => assertAnswer(CHOICE, "billing", { minProbability: 0.5 })).not.toThrow();
  expect(() => assertAnswer(CHOICE, "billing", { minProbability: 0.8 })).toThrow(/carried only/);
});

it("catches a low-confidence win", () => {
  expect(() => assertAnswer(CHOICE, "billing", { minConfidence: 0.8 })).toThrow(/confidence was/);
});

it("explains the alternative when a noul is given minConfidence", () => {
  expect(() => assertAnswer(NOUL, true, { minConfidence: 0.5 })).toThrow(/carries no confidence/);
});

it("uses decisiveness for a noul", () => {
  expect(() => assertConfident(NOUL, 0.9)).not.toThrow();
  expect(() => assertConfident({ type: "noul", noul: 0.52 }, 0.5)).toThrow(/decisiveness/);
});

it("uses confidence for a choice", () => {
  expect(() => assertConfident(CHOICE, 0.9)).toThrow(/confidence was/);
});

it("orders probabilities by mass in the description", () => {
  const out = describeAnswer("team", CHOICE);
  expect(out.indexOf("billing=")).toBeLessThan(out.indexOf("technical="));
});
