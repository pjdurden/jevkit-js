/**
 * Comparing two answers to the same request.
 *
 * TypeSafe's docs warn that `jev-latest` moves when a new version ships, and
 * that confidence thresholds tuned against one version do not automatically
 * hold on the next. This module answers the question that warning implies: for
 * a set of requests you already care about, what actually changed?
 *
 * Two kinds of change are tracked separately, because they mean different
 * things:
 *
 * - A **flip** is a changed decision. Your code takes a different branch. This
 *   is what breaks things.
 * - A **shift** is movement in the probability distribution with the same
 *   decision on top. Harmless alone, but it is what moves an answer toward a
 *   threshold, so a large shift is an early warning before anything flips.
 */

import { type Answer, type Record as JevlRecord, parseAnswers } from "@jevkit/core";

/**
 * Total variation distance between two distributions, on 0..1.
 *
 * Outcomes present in one distribution and not the other count in full, which
 * is what makes this meaningful when a new model version changes the option
 * set. Distributions are not renormalized: if the API returns something that
 * does not sum to 1, that is reported rather than hidden.
 */
export function totalVariation(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const k of keys) sum += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return sum / 2;
}

export class QuestionDelta {
  constructor(
    readonly questionId: string,
    readonly type: string,
    readonly before: unknown,
    readonly after: unknown,
    readonly distributionShift: number,
    readonly confidenceBefore: number | null,
    readonly confidenceAfter: number | null,
    readonly scoreBefore: number | null = null,
    readonly scoreAfter: number | null = null,
  ) {}

  /** The selected outcome changed. */
  get flipped(): boolean {
    return this.before !== this.after;
  }

  get confidenceDelta(): number | null {
    if (this.confidenceBefore === null || this.confidenceAfter === null) return null;
    return this.confidenceAfter - this.confidenceBefore;
  }

  describe(): string {
    const head = this.flipped
      ? `${this.questionId}: FLIP ${JSON.stringify(this.before)} -> ${JSON.stringify(this.after)}`
      : `${this.questionId}: stable (${JSON.stringify(this.before)})`;
    const parts = [`shift=${this.distributionShift.toFixed(3)}`];
    const delta = this.confidenceDelta;
    if (delta !== null) {
      const sign = delta >= 0 ? "+" : "";
      parts.push(
        `conf ${this.confidenceBefore!.toFixed(3)} -> ${this.confidenceAfter!.toFixed(3)} ` +
          `(${sign}${delta.toFixed(3)})`,
      );
    }
    return `${head}  [${parts.join(", ")}]`;
  }
}

export class RecordDelta {
  constructor(
    readonly requestId: string,
    readonly modelBefore: string,
    readonly modelAfter: string,
    readonly questions: QuestionDelta[] = [],
  ) {}

  get flips(): QuestionDelta[] {
    return this.questions.filter((q) => q.flipped);
  }

  get maxShift(): number {
    return this.questions.reduce((m, q) => Math.max(m, q.distributionShift), 0);
  }
}

export function compareAnswers(qid: string, before: Answer, after: Answer): QuestionDelta {
  if (before.type !== after.type) {
    throw new Error(
      `question "${qid}": type changed from "${before.type}" to "${after.type}". ` +
        `These are not the same question and cannot be compared.`,
    );
  }
  return new QuestionDelta(
    qid,
    before.type,
    before.predicted(),
    after.predicted(),
    totalVariation(before.probabilities, after.probabilities),
    before.confidence,
    after.confidence,
    before.score,
    after.score,
  );
}

export function compareRecords(before: JevlRecord, after: JevlRecord): RecordDelta {
  if (before.requestId !== after.requestId) {
    throw new Error(
      `records describe different requests and cannot be compared ` +
        `(${before.requestId} vs ${after.requestId})`,
    );
  }
  const old = parseAnswers(before.answers);
  const fresh = parseAnswers(after.answers);

  const missing = Object.keys(old).filter((k) => !(k in fresh)).sort();
  const added = Object.keys(fresh).filter((k) => !(k in old)).sort();
  if (missing.length || added.length) {
    const detail: string[] = [];
    if (missing.length) detail.push(`missing in the new run: ${missing.join(", ")}`);
    if (added.length) detail.push(`only in the new run: ${added.join(", ")}`);
    throw new Error(`answer sets differ for request ${before.requestId}: ${detail.join("; ")}`);
  }

  return new RecordDelta(
    before.requestId,
    before.model,
    after.model,
    Object.keys(old)
      .sort()
      .map((qid) => compareAnswers(qid, old[qid]!, fresh[qid]!)),
  );
}

export class DriftReport {
  constructor(
    readonly deltas: RecordDelta[] = [],
    readonly unmatchedBefore: string[] = [],
    readonly unmatchedAfter: string[] = [],
  ) {}

  get totalQuestions(): number {
    return this.deltas.reduce((n, d) => n + d.questions.length, 0);
  }

  get flips(): Array<[string, QuestionDelta]> {
    return this.deltas.flatMap((d) => d.flips.map((q) => [d.requestId, q] as [string, QuestionDelta]));
  }

  get flipRate(): number {
    const total = this.totalQuestions;
    return total ? this.flips.length / total : 0;
  }

  get maxShift(): number {
    return this.deltas.reduce((m, d) => Math.max(m, d.maxShift), 0);
  }

  get meanShift(): number {
    const shifts = this.deltas.flatMap((d) => d.questions.map((q) => q.distributionShift));
    return shifts.length ? shifts.reduce((a, b) => a + b, 0) / shifts.length : 0;
  }

  models(): [Set<string>, Set<string>] {
    return [
      new Set(this.deltas.map((d) => d.modelBefore)),
      new Set(this.deltas.map((d) => d.modelAfter)),
    ];
  }

  summary(): string {
    const [before, after] = this.models();
    const lines = [
      `compared ${this.deltas.length} request(s), ${this.totalQuestions} question(s)`,
      `  ${[...before].sort().join(", ") || "?"} -> ${[...after].sort().join(", ") || "?"}`,
      `  flips:      ${this.flips.length} (${(this.flipRate * 100).toFixed(1)}%)`,
      `  mean shift: ${this.meanShift.toFixed(4)}`,
      `  max shift:  ${this.maxShift.toFixed(4)}`,
    ];
    if (this.unmatchedBefore.length) {
      lines.push(
        `  ${this.unmatchedBefore.length} record(s) in the baseline had no counterpart ` +
          `and were not compared`,
      );
    }
    if (this.unmatchedAfter.length) {
      lines.push(
        `  ${this.unmatchedAfter.length} record(s) in the new run had no counterpart ` +
          `and were not compared`,
      );
    }
    return lines.join("\n");
  }

  toJSON() {
    return {
      requests: this.deltas.length,
      questions: this.totalQuestions,
      flips: this.flips.length,
      flipRate: this.flipRate,
      meanShift: this.meanShift,
      maxShift: this.maxShift,
      unmatchedBefore: this.unmatchedBefore,
      unmatchedAfter: this.unmatchedAfter,
      details: this.flips.map(([rid, q]) => ({
        requestId: rid,
        questionId: q.questionId,
        before: q.before,
        after: q.after,
        distributionShift: q.distributionShift,
        confidenceDelta: q.confidenceDelta,
      })),
    };
  }
}

/**
 * Pair two sets of records by request id and compare each pair.
 *
 * Records pair on `requestId`, the digest of state plus questions with the
 * model excluded, which is exactly what makes a baseline comparable to its
 * replay on a different model version.
 */
export function compareSets(before: JevlRecord[], after: JevlRecord[]): DriftReport {
  const old = new Map(before.map((r) => [r.requestId, r]));
  const fresh = new Map(after.map((r) => [r.requestId, r]));
  const shared = [...old.keys()].filter((k) => fresh.has(k)).sort();
  return new DriftReport(
    shared.map((rid) => compareRecords(old.get(rid)!, fresh.get(rid)!)),
    [...old.keys()].filter((k) => !fresh.has(k)).sort(),
    [...fresh.keys()].filter((k) => !old.has(k)).sort(),
  );
}
