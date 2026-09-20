/** RFC 8785 JSON Canonicalization, and the digests jevkit builds on it. */

import { createHash } from "node:crypto";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/**
 * Sort keys by Unicode code point.
 *
 * `Array.prototype.sort` on strings compares UTF-16 code units, which orders
 * astral-plane characters wrongly relative to the code-point order RFC 8785
 * requires. Comparing the code-point arrays directly fixes that.
 */
function compareCodePoints(a: string, b: string): number {
  const ca = Array.from(a).map((c) => c.codePointAt(0)!);
  const cb = Array.from(b).map((c) => c.codePointAt(0)!);
  const n = Math.min(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    const x = ca[i]!;
    const y = cb[i]!;
    if (x !== y) return x < y ? -1 : 1;
  }
  return ca.length - cb.length;
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  const type = typeof value;

  if (type === "boolean") return value ? "true" : "false";

  if (type === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new TypeError(`cannot canonicalize non-finite number: ${n}`);
    }
    // JSON.stringify emits ECMAScript shortest-round-trip form, which is what
    // RFC 8785 specifies for numbers.
    return JSON.stringify(n);
  }

  if (type === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map((v) => serialize(v === undefined ? null : v)).join(",") + "]";
  }

  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort(compareCodePoints);
    const body = keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`).join(",");
    return "{" + body + "}";
  }

  throw new TypeError(`cannot canonicalize value of type ${type}`);
}

/** Serialize to RFC 8785 canonical form. */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

/** `sha256:<hex>` over the canonical form of `value`. */
export function digest(value: unknown): string {
  return "sha256:" + createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/**
 * Digest of state + questions, with no model.
 *
 * This is what pairs a golden-set record with its replay on a different model
 * version, since the full record id includes the model and would differ.
 */
export function requestId(state: unknown, questions: Record<string, unknown>): string {
  return digest({ questions, state });
}

/** Digest of model + state + questions. The record's `id` field. */
export function recordId(
  model: string,
  state: unknown,
  questions: Record<string, unknown>,
): string {
  return digest({ model, questions, state });
}
