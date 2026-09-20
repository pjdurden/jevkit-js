#!/usr/bin/env node
/** `jevkit-drift` command line interface. */

import { RecordFormatError, readRecords } from "@jevkit/core";

import { compareSets } from "./compare.js";

export const EXIT_OK = 0;
export const EXIT_DRIFTED = 1;
export const EXIT_USAGE = 2;

const USAGE = `usage: jevkit-drift <baseline.jevl> <candidate.jevl> [options]

Compare two .jevl runs of the same requests and report which decisions flipped.
Never calls the API.

  --max-flips N    tolerated number of flipped decisions (default 0)
  --max-shift F    fail if any distribution moves more than this (0..1)
  --format text|json
  --quiet          only print the summary`;

export function main(argv: string[] = process.argv.slice(2)): number {
  const files: string[] = [];
  let maxFlips = 0;
  let maxShift: number | null = null;
  let format: "text" | "json" = "text";
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--max-flips": maxFlips = Number(argv[++i]); break;
      case "--max-shift": maxShift = Number(argv[++i]); break;
      case "--format": {
        const v = argv[++i];
        if (v !== "text" && v !== "json") { console.error("jevkit-drift: --format expects text or json"); return EXIT_USAGE; }
        format = v; break;
      }
      case "--quiet": quiet = true; break;
      case "-h": case "--help": console.log(USAGE); return EXIT_OK;
      default:
        if (arg.startsWith("--")) { console.error(`jevkit-drift: unknown option ${arg}`); return EXIT_USAGE; }
        files.push(arg);
    }
  }

  if (files.length !== 2) { console.error(USAGE); return EXIT_USAGE; }

  let before, after;
  try {
    before = readRecords(files[0]!);
    after = readRecords(files[1]!);
  } catch (err) {
    const message = err instanceof RecordFormatError ? err.message : (err as Error).message;
    console.error(`jevkit-drift: ${message}`);
    return EXIT_USAGE;
  }

  let report;
  try {
    report = compareSets(before, after);
  } catch (err) {
    console.error(`jevkit-drift: ${(err as Error).message}`);
    return EXIT_USAGE;
  }

  if (format === "json") {
    console.log(JSON.stringify(report.toJSON(), null, 2));
  } else {
    console.log(report.summary());
    if (report.flips.length && !quiet) {
      console.log("\nflipped decisions:");
      for (const [requestId, delta] of report.flips) {
        console.log(`  ${requestId.slice(7, 19)}  ${delta.describe()}`);
      }
    }
  }

  if (!report.deltas.length && (before.length || after.length)) {
    console.error(
      "jevkit-drift: no requests matched between the two files. Records pair on state " +
      "and questions, so a change to either makes them incomparable.",
    );
    return EXIT_USAGE;
  }

  if (report.flips.length > maxFlips) return EXIT_DRIFTED;
  if (maxShift !== null && report.maxShift > maxShift) return EXIT_DRIFTED;
  return EXIT_OK;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) process.exit(main());
