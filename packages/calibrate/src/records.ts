/** Turning labeled `.jevl` records into calibration observations. */

import { type Record as JevlRecord, parseAnswers } from "@jevkit/core";

import { Observation } from "./metrics.js";

export interface ExtractOptions {
  questionIds?: Iterable<string>;
  /**
   * Which quantity to calibrate.
   *
   * The default, `false`, uses the probability mass on the chosen outcome,
   * which is what "when it says 0.8, is it right 80% of the time" means.
   * `true` calibrates the API's `confidence` statistic instead, which is a
   * different question and answers whether your *routing* threshold is well
   * placed. Nouls have no confidence, so they fall back to probability either
   * way.
   */
  useConfidence?: boolean;
}

/**
 * Extract one observation per labeled answer.
 *
 * Records with no `label` are skipped: calibration needs ground truth, and
 * silently treating an unlabeled record as correct or incorrect would poison
 * every number downstream.
 */
export function observationsFromRecords(
  records: Iterable<JevlRecord>,
  options: ExtractOptions = {},
): Observation[] {
  const wanted = options.questionIds ? new Set(options.questionIds) : null;
  const out: Observation[] = [];

  for (const record of records) {
    if (!record.label || !Object.keys(record.label).length) continue;
    const answers = parseAnswers(record.answers);
    for (const [qid, label] of Object.entries(record.label)) {
      if (wanted && !wanted.has(qid)) continue;
      const answer = answers[qid];
      if (!answer) continue;
      const probability =
        options.useConfidence && answer.confidence !== null
          ? answer.confidence
          : answer.topProbability;
      out.push(
        new Observation({
          probability,
          correct: answer.isCorrect(label),
          questionId: qid,
          requestId: record.requestId,
        }),
      );
    }
  }
  return out;
}
