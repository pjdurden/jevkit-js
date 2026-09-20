/**
 * Detect when a new Jev model version changes decisions you depend on.
 *
 * TypeSafe's docs warn that `jev-latest` moves and that tuned confidence
 * thresholds move with it. This package replays a golden set against a new
 * version and reports what actually changed, separating flipped decisions from
 * probability shifts that have not flipped anything yet.
 */

export {
  DriftReport, QuestionDelta, RecordDelta, compareAnswers, compareRecords,
  compareSets, totalVariation,
} from "./compare.js";
export { replay, type SystemOneCallable } from "./replay.js";

export const VERSION = "0.1.0";
