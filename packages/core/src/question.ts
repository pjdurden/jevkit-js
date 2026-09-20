/**
 * A uniform view of a jev question.
 *
 * Questions arrive as plain objects sent to the HTTP API, as SDK objects, or
 * from a user's own helper. Every jevkit tool wants the same few facts, so they
 * are normalized once here.
 *
 * `instructions` and `criteria` both accept JSON structure, not just strings,
 * so the normalized form keeps the raw value and exposes flattened text
 * separately for textual analysis.
 */

export type QuestionType = "choice" | "score" | "noul";

const VALID_TYPES: readonly string[] = ["choice", "score", "noul"];

/** Collapse a string / object / array into one string for textual analysis. */
export function flattenText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(flattenText).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Keys carry meaning: in a Choice they are the option names.
      parts.push(k, flattenText(v));
    }
    return parts.filter(Boolean).join(" ");
  }
  return String(value);
}

export class Question {
  constructor(
    readonly id: string,
    readonly type: QuestionType,
    readonly instructions: unknown,
    readonly criteria: unknown,
    readonly raw: unknown = undefined,
  ) {}

  get instructionsText(): string {
    return flattenText(this.instructions);
  }

  get criteriaText(): string {
    return flattenText(this.criteria);
  }

  /** Everything the model reads, as one string. */
  get text(): string {
    return `${this.instructionsText} ${this.criteriaText}`.trim();
  }

  /** Choice option keys, or Score level descriptions. Empty otherwise. */
  get options(): string[] {
    const c = this.criteria;
    if (this.type === "choice" && c && typeof c === "object" && !Array.isArray(c)) {
      return Object.keys(c as Record<string, unknown>);
    }
    if (this.type === "score" && Array.isArray(c)) {
      return c.map(flattenText);
    }
    if (this.type === "score" && c && typeof c === "object") {
      return Object.values(c as Record<string, unknown>).map(flattenText);
    }
    return [];
  }

  /** [option key, description] pairs for a Choice. */
  optionDescriptions(): Array<[string, string]> {
    const c = this.criteria;
    if (this.type === "choice" && c && typeof c === "object" && !Array.isArray(c)) {
      return Object.entries(c as Record<string, unknown>).map(
        ([k, v]) => [k, flattenText(v)] as [string, string],
      );
    }
    return [];
  }
}

function get(obj: unknown, name: string): unknown {
  if (obj && typeof obj === "object") return (obj as Record<string, unknown>)[name];
  return undefined;
}

function inferType(obj: unknown): QuestionType | null {
  const declared = get(obj, "type");
  if (typeof declared === "string" && VALID_TYPES.includes(declared.toLowerCase())) {
    return declared.toLowerCase() as QuestionType;
  }
  // SDK objects carry no `type` field; fall back to the constructor name.
  const ctor = (obj as { constructor?: { name?: string } })?.constructor?.name?.toLowerCase();
  if (ctor && VALID_TYPES.includes(ctor)) return ctor as QuestionType;
  return null;
}

export function normalizeQuestion(qid: string, obj: unknown): Question {
  const type = inferType(obj);
  if (type === null) {
    throw new TypeError(
      `question "${qid}": cannot determine type. Expected a "type" key of ` +
        `${VALID_TYPES.join(" | ")}, or a Choice/Score/Noul object.`,
    );
  }
  return new Question(qid, type, get(obj, "instructions"), get(obj, "criteria"), obj);
}

export function normalizeQuestions(questions: Record<string, unknown>): Question[] {
  return Object.entries(questions).map(([qid, obj]) => normalizeQuestion(qid, obj));
}
