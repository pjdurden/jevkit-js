/**
 * Scoring a labeled `.jevl` suite, and comparing two runs of it.
 *
 * The question this answers is the one you actually have to defend: for this
 * task, on my data, is Jev good enough, and what does it cost? That needs
 * accuracy and cost together, because any one of them alone is easy to win.
 *
 * Costs come from a price per million input tokens, defaulting to Jev's
 * published $0.042. Output tokens are free on Jev and are reported but never
 * billed.
 */

import { type Record as JevlRecord, parseAnswers } from "jevkit-core";

export const PRICE_PER_MTOK = 0.042;

/** One scored question from one record. */
export interface QuestionResult {
  requestId: string;
  questionId: string;
  type: string;
  predicted: unknown;
  label: unknown;
  correct: boolean;
  probability: number;
  confidence: number | null;
  tags: readonly string[];
}

/** Everything scored from one run of a suite. */
export class SuiteResult {
  results: QuestionResult[] = [];
  inputTokens = 0;
  outputTokens = 0;
  records = 0;
  unlabeled = 0;
  models = new Set<string>();

  constructor(readonly pricePerMtok = PRICE_PER_MTOK) {}

  get count(): number {
    return this.results.length;
  }

  get correct(): number {
    return this.results.filter((r) => r.correct).length;
  }

  get accuracy(): number {
    return this.count ? this.correct / this.count : 0;
  }

  /** Input-token cost in dollars. Jev bills input only. */
  get cost(): number {
    return (this.inputTokens / 1_000_000) * this.pricePerMtok;
  }

  get costPerQuestion(): number {
    return this.count ? this.cost / this.count : 0;
  }

  /** tag -> [n, accuracy]. A result with several tags counts under each. */
  byTag(): Record<string, [number, number]> {
    const buckets = new Map<string, QuestionResult[]>();
    for (const r of this.results) {
      for (const tag of r.tags) {
        if (!buckets.has(tag)) buckets.set(tag, []);
        buckets.get(tag)!.push(r);
      }
    }
    const out: Record<string, [number, number]> = {};
    for (const tag of [...buckets.keys()].sort()) {
      const rs = buckets.get(tag)!;
      out[tag] = [rs.length, rs.filter((r) => r.correct).length / rs.length];
    }
    return out;
  }

  /** question id -> [n, accuracy]. Finds the one question dragging the suite. */
  byQuestion(): Record<string, [number, number]> {
    const buckets = new Map<string, QuestionResult[]>();
    for (const r of this.results) {
      if (!buckets.has(r.questionId)) buckets.set(r.questionId, []);
      buckets.get(r.questionId)!.push(r);
    }
    const out: Record<string, [number, number]> = {};
    for (const qid of [...buckets.keys()].sort()) {
      const rs = buckets.get(qid)!;
      out[qid] = [rs.length, rs.filter((r) => r.correct).length / rs.length];
    }
    return out;
  }

  /** Wrong answers, most confident first: the most interesting bugs. */
  failures(): QuestionResult[] {
    return this.results.filter((r) => !r.correct).sort((a, b) => b.probability - a.probability);
  }

  summary(): string {
    const lines = [
      `records:   ${this.records}` +
        (this.unlabeled ? ` (${this.unlabeled} unlabeled, skipped)` : ""),
      `scored:    ${this.count} question(s)`,
      `model(s):  ${[...this.models].sort().join(", ") || "?"}`,
      `accuracy:  ${this.accuracy.toFixed(4)}  (${this.correct}/${this.count})`,
      `tokens:    ${this.inputTokens.toLocaleString("en-US")} in, ` +
        `${this.outputTokens.toLocaleString("en-US")} out (out is free)`,
      `cost:      $${this.cost.toFixed(6)}  ($${this.costPerQuestion.toFixed(8)}/question ` +
        `at $${this.pricePerMtok}/Mtok)`,
    ];
    const tags = this.byTag();
    if (Object.keys(tags).length) {
      lines.push("by tag:");
      for (const [tag, [n, acc]] of Object.entries(tags)) {
        lines.push(`  ${tag.padEnd(24)} ${acc.toFixed(4)}  (n=${n})`);
      }
    }
    const questions = this.byQuestion();
    if (Object.keys(questions).length > 1) {
      lines.push("by question:");
      for (const [qid, [n, acc]] of Object.entries(questions)) {
        lines.push(`  ${qid.padEnd(24)} ${acc.toFixed(4)}  (n=${n})`);
      }
    }
    return lines.join("\n");
  }

  toJSON() {
    const mapped = (src: Record<string, [number, number]>) =>
      Object.fromEntries(Object.entries(src).map(([k, [n, a]]) => [k, { n, accuracy: a }]));
    return {
      records: this.records,
      unlabeled: this.unlabeled,
      scored: this.count,
      models: [...this.models].sort(),
      accuracy: this.accuracy,
      correct: this.correct,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cost: this.cost,
      byTag: mapped(this.byTag()),
      byQuestion: mapped(this.byQuestion()),
    };
  }
}

export interface ScoreOptions {
  questionIds?: Iterable<string>;
  pricePerMtok?: number;
}

/**
 * Score every labeled answer in a suite.
 *
 * Records with no `label` are counted and skipped rather than silently dropped,
 * so a suite that quietly lost its labels shows up in the summary instead of
 * producing a suspiciously perfect score over three records.
 */
export function scoreRecords(
  records: Iterable<JevlRecord>,
  options: ScoreOptions = {},
): SuiteResult {
  const wanted = options.questionIds ? new Set(options.questionIds) : null;
  const suite = new SuiteResult(options.pricePerMtok ?? PRICE_PER_MTOK);

  for (const record of records) {
    suite.records += 1;
    suite.models.add(record.model);
    const usage = (record.usage ?? {}) as Record<string, unknown>;
    suite.inputTokens += Number(usage["input_tokens"] ?? 0);
    suite.outputTokens += Number(usage["output_tokens"] ?? 0);

    if (!record.label || !Object.keys(record.label).length) {
      suite.unlabeled += 1;
      continue;
    }

    const answers = parseAnswers(record.answers);
    for (const [qid, label] of Object.entries(record.label)) {
      if (wanted && !wanted.has(qid)) continue;
      const answer = answers[qid];
      if (!answer) continue;
      suite.results.push({
        requestId: record.requestId,
        questionId: qid,
        type: answer.type,
        predicted: answer.predicted(),
        label,
        correct: answer.isCorrect(label),
        probability: answer.topProbability,
        confidence: answer.confidence,
        tags: [...record.tags],
      });
    }
  }
  return suite;
}

/** Two runs of the same suite, side by side. */
export class SuiteComparison {
  constructor(
    readonly baseline: SuiteResult,
    readonly candidate: SuiteResult,
    readonly regressions: Array<[string, string]> = [],
    readonly fixes: Array<[string, string]> = [],
  ) {}

  get accuracyDelta(): number {
    return this.candidate.accuracy - this.baseline.accuracy;
  }

  get costDelta(): number {
    return this.candidate.cost - this.baseline.cost;
  }

  summary(): string {
    const sign = (n: number, digits: number) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
    return [
      `accuracy:  ${this.baseline.accuracy.toFixed(4)} -> ` +
        `${this.candidate.accuracy.toFixed(4)} (${sign(this.accuracyDelta, 4)})`,
      `cost:      $${this.baseline.cost.toFixed(6)} -> ` +
        `$${this.candidate.cost.toFixed(6)} (${sign(this.costDelta, 6)})`,
      `regressed: ${this.regressions.length} (right before, wrong now)`,
      `fixed:     ${this.fixes.length} (wrong before, right now)`,
    ].join("\n");
  }
}

/**
 * Compare two scored runs by (request, question).
 *
 * Aggregate accuracy can hold steady while the *set* of things you get right
 * churns underneath, which matters when a specific case is the one you promised
 * someone would work. Regressions and fixes are tracked individually for that
 * reason.
 */
export function compareSuites(baseline: SuiteResult, candidate: SuiteResult): SuiteComparison {
  const index = (suite: SuiteResult) =>
    new Map(suite.results.map((r) => [`${r.requestId}\u0000${r.questionId}`, r]));
  const before = index(baseline);
  const after = index(candidate);
  const shared = [...before.keys()].filter((k) => after.has(k));
  const split = (k: string) => k.split("\u0000") as [string, string];

  return new SuiteComparison(
    baseline,
    candidate,
    shared.filter((k) => before.get(k)!.correct && !after.get(k)!.correct).sort().map(split),
    shared.filter((k) => !before.get(k)!.correct && after.get(k)!.correct).sort().map(split),
  );
}
