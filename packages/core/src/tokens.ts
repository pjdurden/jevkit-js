/**
 * Token budget estimation for jev requests.
 *
 * Jev ingests the state once and evaluates every question against it, so two
 * budgets apply, both documented on the model card:
 *
 *     64k  state + every question combined
 *     32k  state + the single longest question
 *
 * These are estimates. jevkit deliberately ships no tokenizer: TypeSafe does
 * not publish which one Jev uses, and a confidently wrong count is worse than
 * an honest approximation. The estimator errs conservative.
 */

import { canonicalJson } from "./canonical.js";

export const TOTAL_BUDGET = 64_000;
export const STATE_BUDGET = 32_000;

// Bytes per token. English on BPE-family tokenizers runs ~4.0; 3.5 buys
// headroom for punctuation-dense JSON without being absurd.
const BYTES_PER_TOKEN = 3.5;

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** Conservative token estimate for any JSON-serializable value. */
export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : canonicalJson(value);
  return Math.max(1, Math.floor(byteLength(text) / BYTES_PER_TOKEN) + 1);
}

export interface BudgetReport {
  stateTokens: number;
  questionTokens: Record<string, number>;
  longestQuestionId: string | null;
  /** state + all questions. */
  total: number;
  /** state + the single longest question. */
  longestPair: number;
  overTotal: boolean;
  overState: boolean;
}

export function checkBudget(
  state: unknown,
  questions: Record<string, unknown>,
): BudgetReport {
  const stateTokens = estimateTokens(state);
  const questionTokens: Record<string, number> = {};
  for (const [qid, q] of Object.entries(questions)) {
    questionTokens[qid] = estimateTokens(q);
  }

  let longestQuestionId: string | null = null;
  for (const [qid, n] of Object.entries(questionTokens)) {
    if (longestQuestionId === null || n > questionTokens[longestQuestionId]!) {
      longestQuestionId = qid;
    }
  }

  const questionSum = Object.values(questionTokens).reduce((a, b) => a + b, 0);
  const total = stateTokens + questionSum;
  const longestPair =
    longestQuestionId === null ? stateTokens : stateTokens + questionTokens[longestQuestionId]!;

  return {
    stateTokens,
    questionTokens,
    longestQuestionId,
    total,
    longestPair,
    overTotal: total > TOTAL_BUDGET,
    overState: longestPair > STATE_BUDGET,
  };
}
