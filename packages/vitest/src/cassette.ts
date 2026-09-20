/**
 * Record and replay jev requests so tests do not hit the API.
 *
 * A model call in a test is slow, costs money, needs a key in CI, and can
 * change its answer under you when the alias moves. The fix is the one VCR
 * established for HTTP: record real responses once, replay them forever,
 * re-record on purpose.
 *
 * A cassette is a `.jevl` file, the same format `drift`, `bench` and
 * `calibrate` read, so a recording made by your test suite is also a golden set
 * you can replay against the next model version.
 */

import { existsSync } from "node:fs";

import { Record as JevlRecord, appendRecord, readRecords, recordId } from "jevkit-core";

export type Mode = "replay" | "record" | "auto" | "passthrough";

const MODES: readonly Mode[] = ["replay", "record", "auto", "passthrough"];

/** A request was not on the cassette and the mode forbids recording. */
export class CassetteMiss extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CassetteMiss";
  }
}

export type SystemOneCallable = (
  state: unknown,
  questions: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<unknown> | unknown;

function plain(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (Array.isArray(value)) return value;
  return { ...(value as Record<string, unknown>) };
}

function responseToParts(response: unknown): {
  model: string;
  answers: Record<string, unknown>;
  usage: Record<string, unknown> | null;
} {
  const obj = (response ?? {}) as Record<string, unknown>;
  const answers = (obj["answers"] ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [qid, a] of Object.entries(answers)) out[qid] = plain(a);
  const usage = obj["usage"];
  return {
    model: String(obj["model"] ?? ""),
    answers: out,
    usage: usage === undefined || usage === null ? null : (plain(usage) as Record<string, unknown>),
  };
}

/** What a cassette hands back in place of a live API response. */
export class ReplayedResponse {
  readonly model: string;
  readonly answers: Record<string, Record<string, unknown>>;
  readonly usage: Record<string, unknown> | null;
  readonly id: string;

  constructor(record: JevlRecord) {
    this.model = record.model;
    this.answers = record.answers as Record<string, Record<string, unknown>>;
    this.usage = record.usage;
    this.id = record.id;
  }
}

export interface CassetteOptions {
  systemOne?: SystemOneCallable;
  mode?: Mode;
  model?: string;
}

/**
 * A recorded set of jev requests, replayed by request digest.
 *
 * `mode` controls what happens on a miss:
 *
 * - `replay`      throw `CassetteMiss`. The right default for CI.
 * - `auto`        replay a hit, call through and append on a miss.
 * - `record`      always call through and append, ignoring existing entries.
 * - `passthrough` never touch the cassette.
 */
export class Cassette {
  readonly mode: Mode;
  readonly model: string;
  readonly played: string[] = [];
  readonly recorded: string[] = [];

  private readonly systemOneImpl: SystemOneCallable | undefined;
  private entries: Map<string, JevlRecord>;

  constructor(readonly path: string, options: CassetteOptions = {}) {
    this.mode = options.mode ?? "replay";
    if (!MODES.includes(this.mode)) {
      throw new RangeError(`mode must be one of ${MODES.join(", ")}, got "${this.mode}"`);
    }
    this.model = options.model ?? "jev-latest";
    this.systemOneImpl = options.systemOne;
    this.entries =
      existsSync(this.path) && this.mode !== "record" ? this.load() : new Map();
  }

  /**
   * Index the file by *requested*-model digest.
   *
   * A record stores the model that actually answered, which is what the format
   * requires: `jev-latest` is an alias and the response says `jev-1.13.0`. But
   * a test asks for the alias, so indexing on the answering model would miss
   * every lookup. The requested model is kept in `meta` at record time and used
   * to rebuild the index here.
   *
   * Later entries win, so re-recording appends rather than requiring a rewrite.
   */
  private load(): Map<string, JevlRecord> {
    const entries = new Map<string, JevlRecord>();
    for (const record of readRecords(this.path)) {
      const requested = String(record.meta["requested_model"] ?? record.model);
      entries.set(recordId(requested, record.state, record.questions), record);
    }
    return entries;
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Entries on the cassette that no test asked for.
   *
   * Usually means a test was deleted or a question reworded, leaving a stale
   * recording that will quietly rot.
   */
  get unplayed(): string[] {
    return [...this.entries.keys()].filter((k) => !this.played.includes(k)).sort();
  }

  contains(state: unknown, questions: Record<string, unknown>, model?: string): boolean {
    return this.entries.has(recordId(model ?? this.model, state, questions));
  }

  /**
   * Drop-in for a client's `systemOne`.
   *
   * Always returns a promise, so a cassette can stand in for an async client
   * without the caller knowing whether the answer came from disk or the wire.
   */
  async systemOne(
    state: unknown,
    questions: Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): Promise<unknown> {
    const { model: requested, ...rest } = options;
    const model = String(requested ?? this.model);

    if (this.mode === "passthrough") {
      return this.callThrough(state, questions, { ...rest, model });
    }

    const key = recordId(model, state, questions);

    if (this.mode !== "record") {
      const hit = this.entries.get(key);
      if (hit) {
        this.played.push(key);
        return new ReplayedResponse(hit);
      }
    }

    if (this.mode === "replay") {
      throw new CassetteMiss(
        `no recording for this request on ${this.path}.\n` +
          `  digest: ${key}\n` +
          `  Re-run with mode "auto" (or JEV_RECORD=1) to record it, and commit the ` +
          `updated cassette.`,
      );
    }

    const response = await this.callThrough(state, questions, { ...rest, model });
    const { model: actualModel, answers, usage } = responseToParts(response);
    const record = new JevlRecord({
      model: actualModel || model,
      state,
      questions,
      answers,
      usage,
      meta: { requested_model: model },
    });
    appendRecord(this.path, record);
    this.entries.set(key, record);
    this.recorded.push(key);
    // The live response is returned rather than the record: recording must not
    // change what the code under test sees.
    return response;
  }

  private async callThrough(
    state: unknown,
    questions: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.systemOneImpl) {
      throw new CassetteMiss(
        `cassette ${this.path} is in mode "${this.mode}" and needs to call the API, but ` +
          `no client was supplied. Pass systemOne when constructing it.`,
      );
    }
    return this.systemOneImpl(state, questions, options);
  }
}
