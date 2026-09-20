/**
 * Score a labeled Jev suite for accuracy and cost, and compare runs.
 *
 * Answers the question you have to defend: for this task, on my data, is Jev
 * good enough and what does it cost? Accuracy, tokens and dollars together,
 * because any one of them alone is easy to win.
 */

export {
  PRICE_PER_MTOK, SuiteComparison, SuiteResult, compareSuites, scoreRecords,
  type QuestionResult, type ScoreOptions,
} from "./score.js";

export const VERSION = "0.1.0";
