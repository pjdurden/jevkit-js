import { describe, expect, it } from "vitest";
import { canonicalJson, digest, recordId, requestId } from "../src/canonical.js";

describe("canonicalJson", () => {
  it("is independent of key insertion order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("emits no insignificant whitespace", () => {
    expect(canonicalJson({ a: [1, 2] })).toBe('{"a":[1,2]}');
  });

  it("sorts keys by code point, not UTF-16 code unit", () => {
    // U+1D400 is an astral character; naive UTF-16 sorting misorders it against U+FF00.
    const out = canonicalJson({ "\u{1D400}": 1, "＀": 2 });
    expect(out.indexOf("＀")).toBeLessThan(out.indexOf("\u{1D400}"));
  });

  it("rejects non-finite numbers", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => canonicalJson({ x: bad })).toThrow(TypeError);
    }
    expect(() => canonicalJson({ nested: { deep: [NaN] } })).toThrow(TypeError);
  });

  it("omits undefined object values", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("digests", () => {
  it("are stable and prefixed", () => {
    const d = digest({ a: 1 });
    expect(d.startsWith("sha256:")).toBe(true);
    expect(d).toHaveLength(71);
    expect(d).toBe(digest({ a: 1 }));
  });

  it("requestId ignores the model but recordId does not", () => {
    const state = "hello";
    const questions = { q: { type: "noul", instructions: "ok?" } };
    expect(recordId("jev-1.13.0", state, questions)).not.toBe(
      recordId("jev-1.14.0", state, questions),
    );
    expect(requestId(state, questions)).toBe(requestId(state, questions));
  });

  it("recordId changes when state changes", () => {
    const q = { q: { type: "noul", instructions: "ok?" } };
    expect(recordId("m", "a", q)).not.toBe(recordId("m", "b", q));
  });
});
