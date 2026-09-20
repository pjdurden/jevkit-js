#!/usr/bin/env node
/** `jevkit-lint` command line interface. */

import { readFileSync } from "node:fs";

import { RecordFormatError, parseRecords } from "jevkit-core";

import { lint } from "./linter.js";
import { RULES } from "./rules.js";

export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_USAGE = 2;

type Payload = { label: string; state: unknown; questions: Record<string, unknown> };

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function loadPayload(path: string): Payload[] {
  const text = path === "-" ? readStdin() : readFileSync(path, "utf8");
  const source = path === "-" ? "<stdin>" : path;

  if (path.endsWith(".jevl")) {
    return parseRecords(text, source).map((record, i) => ({
      label: `${source}#${i}`,
      state: record.state,
      questions: record.questions,
    }));
  }

  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${source}: expected a JSON object at the top level`);
  }
  const obj = data as Record<string, unknown>;
  const q = obj["questions"];
  if (q && typeof q === "object" && !Array.isArray(q)) {
    return [{ label: source, state: obj["state"] ?? "", questions: q as Record<string, unknown> }];
  }
  return [{ label: source, state: "", questions: obj }];
}

function printRules(): void {
  const width = Math.max(...RULES.map((r) => r.name.length));
  console.log("code    name".padEnd(8 + width + 2) + "  documented failure mode");
  console.log("-".repeat(8 + width + 42));
  for (const r of RULES) {
    console.log(`${r.code}  ${r.name.padEnd(width)}  ${r.mode}`);
  }
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const files: string[] = [];
  let select: string[] | undefined;
  let ignore: string[] | undefined;
  let format: "text" | "json" = "text";
  let strict = false;
  let noColor = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--select": select = argv[++i]?.split(","); break;
      case "--ignore": ignore = argv[++i]?.split(","); break;
      case "--format": {
        const v = argv[++i];
        if (v !== "text" && v !== "json") {
          console.error(`jevkit-lint: --format expects text or json`);
          return EXIT_USAGE;
        }
        format = v;
        break;
      }
      case "--strict": strict = true; break;
      case "--no-color": noColor = true; break;
      case "--list-rules": printRules(); return EXIT_OK;
      case "-h":
      case "--help":
        console.log(
          "usage: jevkit-lint [files...] [--select CODES] [--ignore CODES]\n" +
          "                   [--format text|json] [--strict] [--no-color] [--list-rules]\n\n" +
          "Statically lint TypeSafe Jev questions against the documented jev-1.13\n" +
          "failure modes. Never calls the API.",
        );
        return EXIT_OK;
      default:
        if (arg.startsWith("--")) {
          console.error(`jevkit-lint: unknown option ${arg}`);
          return EXIT_USAGE;
        }
        files.push(arg);
    }
  }

  if (!files.length) {
    console.error("jevkit-lint: no input files (use - to read stdin, or --list-rules)");
    return EXIT_USAGE;
  }

  const payloads: Payload[] = [];
  for (const path of files) {
    try {
      payloads.push(...loadPayload(path));
    } catch (err) {
      const message = err instanceof RecordFormatError ? err.message : (err as Error).message;
      console.error(`jevkit-lint: ${message}`);
      return EXIT_USAGE;
    }
  }

  const color = Boolean(process.stdout.isTTY) && !noColor;
  const reports: Array<{ label: string; result: ReturnType<typeof lint> }> = [];
  let anyError = false;
  let anyWarning = false;

  for (const { label, state, questions } of payloads) {
    let result;
    try {
      result = lint(questions, { state, select, ignore });
    } catch (err) {
      console.error(`jevkit-lint: ${label}: ${(err as Error).message}`);
      return EXIT_USAGE;
    }
    anyError = anyError || result.errors.length > 0;
    anyWarning = anyWarning || result.warnings.length > 0;
    reports.push({ label, result });
  }

  if (format === "json") {
    console.log(JSON.stringify(
      { results: reports.map(({ label, result }) => ({ source: label, ...result.toJSON() })) },
      null,
      2,
    ));
  } else {
    const total = { error: 0, warning: 0, info: 0 };
    for (const { label, result } of reports) {
      if (payloads.length > 1) console.log(`== ${label}`);
      console.log(result.format(color));
      if (payloads.length > 1) console.log("");
      const c = result.counts();
      total.error += c.error;
      total.warning += c.warning;
      total.info += c.info;
    }
    if (total.error + total.warning + total.info > 0) {
      console.log(`\n${total.error} error(s), ${total.warning} warning(s), ${total.info} info`);
    }
  }

  if (anyError) return EXIT_FINDINGS;
  if (strict && anyWarning) return EXIT_FINDINGS;
  return EXIT_OK;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) process.exit(main());
