import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FORMAT_VERSION, Record, RecordFormatError, loadCassette, parseRecords, readRecords,
  writeRecords,
} from "../src/record.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "jevkit-"));
}

function make(model = "jev-1.13.0", answers?: Record_["answers"]) {
  return new Record({
    model,
    state: "s",
    questions: { q: { type: "noul", instructions: "ok?" } },
    answers: answers ?? { q: { type: "noul", noul: 0.9 } },
  });
}
type Record_ = ConstructorParameters<typeof Record>[0];

describe("Record", () => {
  it("derives an id when absent", () => {
    expect(make().id.startsWith("sha256:")).toBe(true);
  });

  it("round trips through a file", () => {
    const path = join(tmp(), "a.jevl");
    const original = new Record({ ...(make() as unknown as Record_), tags: ["x"], usage: { input_tokens: 10 } });
    expect(writeRecords(path, [original])).toBe(1);
    const [restored] = readRecords(path);
    expect(restored!.id).toBe(original.id);
    expect(restored!.tags).toEqual(["x"]);
    expect(restored!.usage).toEqual({ input_tokens: 10 });
  });

  it("preserves unknown keys across a round trip", () => {
    const raw = { ...make().toJSON(), future_field: { kept: true } };
    const path = join(tmp(), "a.jevl");
    writeFileSync(path, JSON.stringify(raw) + "\n");
    const [record] = readRecords(path);
    expect(record!.extra["future_field"]).toEqual({ kept: true });
    expect(record!.toJSON()["future_field"]).toEqual({ kept: true });
  });

  it("refuses a newer format version", () => {
    const raw = { ...make().toJSON(), v: FORMAT_VERSION + 1 };
    expect(() => parseRecords(JSON.stringify(raw))).toThrow(/newer than this reader/);
  });

  it("raises on a malformed line rather than skipping it", () => {
    const text = JSON.stringify(make().toJSON()) + "\nnot json\n";
    expect(() => parseRecords(text)).toThrow(RecordFormatError);
  });

  it("raises when a required key is missing", () => {
    const raw = make().toJSON();
    delete raw["answers"];
    expect(() => parseRecords(JSON.stringify(raw))).toThrow(/missing required key/);
  });

  it("skips blank lines", () => {
    const text = "\n" + JSON.stringify(make().toJSON()) + "\n\n";
    expect(parseRecords(text)).toHaveLength(1);
  });

  it("resolves a cassette to the last record for an id", () => {
    const path = join(tmp(), "a.jevl");
    const first = make("jev-1.13.0", { q: { type: "noul", noul: 0.1 } });
    const second = make("jev-1.13.0", { q: { type: "noul", noul: 0.9 } });
    expect(first.id).toBe(second.id);
    writeRecords(path, [first, second]);
    const table = loadCassette(path);
    expect(table.size).toBe(1);
    expect((table.get(first.id)!.answers["q"] as { noul: number }).noul).toBe(0.9);
  });

  it("pairs records across model versions by requestId", () => {
    const a = make("jev-1.13.0");
    const b = make("jev-1.14.0");
    expect(a.id).not.toBe(b.id);
    expect(a.requestId).toBe(b.requestId);
  });
});
