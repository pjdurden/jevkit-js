/** Replaying a golden set against a model. */

import { Record as JevlRecord } from "jevkit-core";

export type SystemOneCallable = (
  state: unknown,
  questions: Record<string, unknown>,
) => Promise<unknown> | unknown;

type Parts = { model: string; answers: Record<string, unknown>; usage: Record<string, unknown> | null };

function plain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value;
  // Class instances from an SDK become plain objects; own enumerable keys only.
  return { ...(value as Record<string, unknown>) };
}

function extract(response: unknown): Parts {
  const obj = (response ?? {}) as Record<string, unknown>;
  const answers = (obj["answers"] ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [qid, answer] of Object.entries(answers)) out[qid] = plain(answer);
  const usage = obj["usage"];
  return {
    model: String(obj["model"] ?? ""),
    answers: out,
    usage: usage === undefined || usage === null ? null : (plain(usage) as Record<string, unknown>),
  };
}

/**
 * Re-send each record's request and return the new answers as new records.
 *
 * `systemOne` is any callable taking `(state, questions)`, which is the shape
 * both official SDKs already expose. Labels and tags carry over from the
 * baseline so a replayed set stays scoreable.
 */
export async function replay(
  records: Iterable<JevlRecord>,
  systemOne: SystemOneCallable,
  options: { tags?: string[] } = {},
): Promise<JevlRecord[]> {
  const extraTags = options.tags ?? [];
  const out: JevlRecord[] = [];
  for (const record of records) {
    const response = await systemOne(record.state, record.questions);
    const { model, answers, usage } = extract(response);
    out.push(
      new JevlRecord({
        model: model || record.model,
        state: record.state,
        questions: record.questions,
        answers,
        usage,
        label: record.label,
        tags: [...record.tags, ...extraTags],
        meta: { ...record.meta, replayed_from: record.id },
      }),
    );
  }
  return out;
}
