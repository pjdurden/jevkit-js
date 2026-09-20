/** Reading and writing `.jevl` records. See docs/specs/record-format-v1.md. */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

import { recordId, requestId } from "./canonical.js";

/**
 * Local alias for the built-in utility type.
 *
 * This module exports a class named `Record`, which shadows TypeScript's
 * `Record<K, V>` inside the file. Aliasing keeps the public class name while
 * leaving the utility type usable.
 */
type Dict<V = unknown> = { [key: string]: V };

export const FORMAT_VERSION = 1;

const REQUIRED = ["v", "id", "ts", "model", "request", "answers"] as const;

/** A `.jevl` line is malformed, or its version is unreadable. */
export class RecordFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordFormatError";
  }
}

export interface RecordInit {
  model: string;
  state: unknown;
  questions: Dict;
  answers: Dict;
  id?: string;
  ts?: string;
  usage?: Dict | null;
  label?: Dict | null;
  tags?: string[];
  meta?: Dict;
  extra?: Dict;
}

function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export class Record {
  readonly model: string;
  readonly state: unknown;
  readonly questions: Dict;
  readonly answers: Dict;
  readonly id: string;
  readonly ts: string;
  readonly usage: Dict | null;
  readonly label: Dict | null;
  readonly tags: string[];
  readonly meta: Dict;
  readonly extra: Dict;

  constructor(init: RecordInit) {
    this.model = init.model;
    this.state = init.state;
    this.questions = init.questions;
    this.answers = init.answers;
    this.ts = init.ts ?? utcNow();
    this.usage = init.usage ?? null;
    this.label = init.label ?? null;
    this.tags = init.tags ?? [];
    this.meta = init.meta ?? {};
    this.extra = init.extra ?? {};
    this.id = init.id || recordId(this.model, this.state, this.questions);
  }

  /** Model-independent digest, used to pair across model versions. */
  get requestId(): string {
    return requestId(this.state, this.questions);
  }

  toJSON(): Dict {
    const out: Dict = {
      v: FORMAT_VERSION,
      id: this.id,
      ts: this.ts,
      model: this.model,
      request: { state: this.state, questions: this.questions },
      answers: this.answers,
    };
    if (this.usage !== null) out["usage"] = this.usage;
    if (this.label !== null) out["label"] = this.label;
    if (this.tags.length) out["tags"] = [...this.tags];
    if (Object.keys(this.meta).length) out["meta"] = { ...this.meta };
    // Unknown keys survive a read/write round trip.
    for (const [k, v] of Object.entries(this.extra)) {
      if (!(k in out)) out[k] = v;
    }
    return out;
  }

  static fromJSON(raw: unknown, source = "<memory>", lineNo = 0): Record {
    const where = lineNo ? `${source}:${lineNo}` : source;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RecordFormatError(`${where}: record must be a JSON object`);
    }
    const obj = raw as Dict;

    const version = obj["v"];
    if (version === undefined) {
      throw new RecordFormatError(`${where}: missing required key 'v'`);
    }
    if (typeof version !== "number" || !Number.isInteger(version)) {
      throw new RecordFormatError(
        `${where}: 'v' must be an integer, got ${JSON.stringify(version)}`,
      );
    }
    if (version > FORMAT_VERSION) {
      throw new RecordFormatError(
        `${where}: record format v${version} is newer than this reader ` +
          `(v${FORMAT_VERSION}). Upgrade jevkit-core rather than guessing.`,
      );
    }

    const missing = REQUIRED.filter((k) => !(k in obj));
    if (missing.length) {
      throw new RecordFormatError(`${where}: missing required key(s): ${missing.join(", ")}`);
    }

    const request = obj["request"];
    if (!request || typeof request !== "object" || !("questions" in request)) {
      throw new RecordFormatError(`${where}: 'request' must be an object with 'questions'`);
    }
    const req = request as { state?: unknown; questions: Dict };

    const known = new Set<string>([...REQUIRED, "usage", "label", "tags", "meta"]);
    const extra: Dict = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!known.has(k)) extra[k] = v;
    }

    return new Record({
      model: obj["model"] as string,
      state: req.state,
      questions: req.questions,
      answers: obj["answers"] as Dict,
      id: obj["id"] as string,
      ts: obj["ts"] as string,
      usage: (obj["usage"] as Dict) ?? null,
      label: (obj["label"] as Dict) ?? null,
      tags: (obj["tags"] as string[]) ?? [],
      meta: (obj["meta"] as Dict) ?? {},
      extra,
    });
  }
}

/**
 * Parse `.jevl` text into records.
 *
 * A line that fails to parse throws. Skipping silently would let a truncated
 * golden set look like a passing one.
 */
export function parseRecords(text: string, source = "<memory>"): Record[] {
  const out: Record[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (err) {
      throw new RecordFormatError(
        `${source}:${i + 1}: invalid JSON: ${(err as Error).message}`,
      );
    }
    out.push(Record.fromJSON(raw, source, i + 1));
  }
  return out;
}

export function readRecords(path: string): Record[] {
  return parseRecords(readFileSync(path, "utf8"), path);
}

export function writeRecords(path: string, records: Iterable<Record>): number {
  let count = 0;
  const lines: string[] = [];
  for (const record of records) {
    lines.push(JSON.stringify(record.toJSON()));
    count++;
  }
  writeFileSync(path, lines.length ? lines.join("\n") + "\n" : "", "utf8");
  return count;
}

export function appendRecord(path: string, record: Record): void {
  appendFileSync(path, JSON.stringify(record.toJSON()) + "\n", "utf8");
}

/**
 * Map record id -> Record, last occurrence winning.
 *
 * Re-recording a request appends rather than rewrites, so the last line for an
 * id is the current answer.
 */
export function loadCassette(path: string): Map<string, Record> {
  const table = new Map<string, Record>();
  for (const record of readRecords(path)) table.set(record.id, record);
  return table;
}
