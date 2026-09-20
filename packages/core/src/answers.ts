/**
 * A uniform view of a jev answer, and how it compares to a ground-truth label.
 *
 * `drift`, `calibrate` and `bench` all need the same three things from an
 * answer: what it predicted, how much probability sat on a given outcome, and
 * whether it matched a label. Those live here so the three packages agree on
 * the definitions rather than each inventing its own.
 *
 * The vocabulary is deliberately narrow:
 *
 * - **predicted** is the outcome the answer selects. For a Choice it is the
 *   option key. For a Noul it is `true` when `noul` clears the threshold. For a
 *   Score it is the index of the most probable level, which is *not* the same
 *   as rounding `score`.
 * - **confidence** is what the API returned, and Nouls do not have one. A
 *   Noul's distance from 0.5 is a different quantity, exposed as `decisiveness`
 *   rather than pretending it is the same number.
 */

export const NOUL_THRESHOLD = 0.5;

export type AnswerType = "choice" | "score" | "noul";

type Raw = { [key: string]: unknown };

export class Answer {
  constructor(
    readonly id: string,
    readonly type: AnswerType,
    readonly raw: Raw,
  ) {}

  /**
   * Outcome -> probability.
   *
   * Choice returns its options, Score its level indices as strings. Noul has no
   * distribution from the API, so the two-outcome distribution it implies is
   * synthesized here.
   */
  get probabilities(): Record<string, number> {
    if (this.type === "noul") {
      const p = Number(this.raw["noul"] ?? 0);
      return { true: p, false: 1 - p };
    }
    const probs = (this.raw["probabilities"] ?? {}) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(probs)) out[String(k)] = Number(v);
    return out;
  }

  /** As returned by the API. `null` for a Noul, which carries none. */
  get confidence(): number | null {
    const value = this.raw["confidence"];
    return value === undefined || value === null ? null : Number(value);
  }

  /**
   * How far from maximally uncertain this answer is, on 0..1.
   *
   * For a Noul this is `|noul - 0.5| * 2`. This is *not* confidence and is not
   * comparable to the API's confidence across question types; it exists so
   * Nouls can be thresholded on something with a defined meaning.
   */
  get decisiveness(): number {
    if (this.type === "noul") {
      return Math.abs(Number(this.raw["noul"] ?? 0) - NOUL_THRESHOLD) * 2;
    }
    return this.confidence ?? 0;
  }

  /** The outcome this answer selects. */
  predicted(noulThreshold: number = NOUL_THRESHOLD): unknown {
    if (this.type === "noul") return Number(this.raw["noul"] ?? 0) >= noulThreshold;
    if (this.type === "choice") return this.raw["choice"];
    if (this.type === "score") {
      const probs = this.probabilities;
      const keys = Object.keys(probs);
      if (!keys.length) return null;
      let best = keys[0]!;
      for (const k of keys) if (probs[k]! > probs[best]!) best = k;
      const asInt = Number.parseInt(best, 10);
      return Number.isNaN(asInt) ? best : asInt;
    }
    return null;
  }

  /** The probability-weighted score, for a Score answer. */
  get score(): number | null {
    if (this.type !== "score") return null;
    const value = this.raw["score"];
    return value === undefined || value === null ? null : Number(value);
  }

  private labelKey(label: unknown): string {
    if (this.type === "noul") return label ? "true" : "false";
    return String(label);
  }

  /**
   * Probability this answer assigned to `label`.
   *
   * Returns 0 for an outcome the question never offered, which is the honest
   * reading: the model could not have selected it.
   */
  probabilityOf(label: unknown): number {
    return this.probabilities[this.labelKey(label)] ?? 0;
  }

  isCorrect(label: unknown, noulThreshold: number = NOUL_THRESHOLD): boolean {
    const predicted = this.predicted(noulThreshold);
    if (this.type === "noul") return Boolean(predicted) === Boolean(label);
    if (this.type === "score") {
      const a = Number(predicted);
      const b = Number(label);
      if (!Number.isNaN(a) && !Number.isNaN(b)) return a === b;
      return predicted === label;
    }
    return predicted === label;
  }

  /** Probability mass on the predicted outcome. */
  get topProbability(): number {
    const values = Object.values(this.probabilities);
    return values.length ? Math.max(...values) : 0;
  }
}

export function parseAnswer(qid: string, raw: unknown): Answer {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError(`answer "${qid}": expected an object, got ${typeof raw}`);
  }
  const obj = raw as Raw;
  let type = obj["type"] as AnswerType | undefined;
  if (type !== "choice" && type !== "score" && type !== "noul") {
    // Infer from shape when the API response omits the discriminator.
    if ("choice" in obj) type = "choice";
    else if ("noul" in obj) type = "noul";
    else if ("score" in obj) type = "score";
    else {
      throw new TypeError(
        `answer "${qid}": cannot determine type; expected a 'type' field or one of ` +
          `'choice'/'score'/'noul'`,
      );
    }
  }
  return new Answer(qid, type, obj);
}

export function parseAnswers(answers: Record<string, unknown>): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const [qid, raw] of Object.entries(answers)) out[qid] = parseAnswer(qid, raw);
  return out;
}
