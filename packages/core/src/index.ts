/**
 * Shared substrate for the jevkit packages.
 *
 * Nothing here calls the jev API. This package holds the pieces every other
 * jevkit tool needs: canonical digests, the `.jevl` record format, a uniform
 * view of a question, and token budget estimation.
 */

export { canonicalJson, digest, recordId, requestId, type Json } from "./canonical.js";
export {
  Question,
  flattenText,
  normalizeQuestion,
  normalizeQuestions,
  type QuestionType,
} from "./question.js";
export {
  FORMAT_VERSION,
  Record,
  RecordFormatError,
  appendRecord,
  loadCassette,
  parseRecords,
  readRecords,
  writeRecords,
  type RecordInit,
} from "./record.js";
export {
  STATE_BUDGET,
  TOTAL_BUDGET,
  checkBudget,
  estimateTokens,
  type BudgetReport,
} from "./tokens.js";

export const VERSION = "0.1.0";
