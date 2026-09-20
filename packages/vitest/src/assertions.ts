/**
 * Assertions over jev answers, with failure messages that say enough.
 *
 * A bare `expect(answer.choice).toBe("billing")` tells you nothing about how
 * close the call was. These assertions print the distribution on failure,
 * because a 0.51/0.49 split and a 0.99/0.01 split are different bugs.
 */

import { parseAnswer } from "@jevkit/core";

export function describeAnswer(qid: string, raw: unknown): string {
  const answer = parseAnswer(qid, raw);
  const probs = Object.entries(answer.probabilities)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v.toFixed(3)}`)
    .join(", ");
  const parts = [`predicted=${JSON.stringify(answer.predicted())}`];
  if (answer.confidence !== null) parts.push(`confidence=${answer.confidence.toFixed(3)}`);
  if (answer.score !== null) parts.push(`score=${answer.score.toFixed(3)}`);
  return `${qid}: ${parts.join(", ")}\n    probabilities: ${probs}`;
}

export interface AssertAnswerOptions {
  questionId?: string;
  minConfidence?: number;
  minProbability?: number;
}

/** Assert an answer selected `expected`, optionally with enough certainty. */
export function assertAnswer(
  raw: unknown,
  expected: unknown,
  options: AssertAnswerOptions = {},
): void {
  const qid = options.questionId ?? "answer";
  const answer = parseAnswer(qid, raw);

  if (!answer.isCorrect(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)} but got ${JSON.stringify(answer.predicted())}\n  ` +
        describeAnswer(qid, raw),
    );
  }

  if (options.minProbability !== undefined) {
    const actual = answer.probabilityOf(expected);
    if (actual < options.minProbability) {
      throw new Error(
        `${JSON.stringify(expected)} was selected but carried only ${actual.toFixed(3)} ` +
          `probability, below the required ${options.minProbability.toFixed(3)}\n  ` +
          describeAnswer(qid, raw),
      );
    }
  }

  if (options.minConfidence !== undefined) {
    if (answer.confidence === null) {
      throw new Error(
        `minConfidence was given but a ${answer.type} answer carries no confidence. ` +
          `Use minProbability instead.`,
      );
    }
    if (answer.confidence < options.minConfidence) {
      throw new Error(
        `${JSON.stringify(expected)} was selected but confidence was ` +
          `${answer.confidence.toFixed(3)}, below the required ` +
          `${options.minConfidence.toFixed(3)}\n  ` + describeAnswer(qid, raw),
      );
    }
  }
}

/**
 * Assert an answer is decisive, without caring which way it went.
 *
 * Uses the API's confidence for Choice and Score. A Noul has none, so its
 * distance from 0.5 is used and the message says so.
 */
export function assertConfident(raw: unknown, minimum: number, questionId = "answer"): void {
  const answer = parseAnswer(questionId, raw);
  const value = answer.decisiveness;
  if (value < minimum) {
    const quantity =
      answer.type === "noul" ? "decisiveness (|noul - 0.5| * 2)" : "confidence";
    throw new Error(
      `${quantity} was ${value.toFixed(3)}, below the required ${minimum.toFixed(3)}\n  ` +
        describeAnswer(questionId, raw),
    );
  }
}
