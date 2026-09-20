#!/usr/bin/env node
/** `jevkit-bench` command line interface. */

import { RecordFormatError, readRecords } from "@jevkit/core";

import { PRICE_PER_MTOK, compareSuites, scoreRecords } from "./score.js";

export const EXIT_OK = 0;
export const EXIT_FAILED_GATE = 1;
export const EXIT_USAGE = 2;

const USAGE = `usage: jevkit-bench <suite.jevl> [options]

Score a labeled .jevl suite for accuracy and cost, and compare two runs of it.
Never calls the API.

  --baseline FILE        a previous run, to compare against
  --question ID          restrict to this question id (repeatable)
  --price-per-mtok F     input price per million tokens (default ${PRICE_PER_MTOK})
  --min-accuracy F       exit non-zero below this
  --max-regressions N    exit non-zero above this many (needs --baseline)
  --show-failures N      print the N most confident wrong answers
  --format text|json`;

export function main(argv: string[] = process.argv.slice(2)): number {
  const files: string[] = [];
  const questions: string[] = [];
  let baselinePath: string | null = null;
  let pricePerMtok = PRICE_PER_MTOK;
  let minAccuracy: number | null = null;
  let maxRegressions: number | null = null;
  let showFailures = 0;
  let format: "text" | "json" = "text";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--baseline": baselinePath = String(argv[++i]); break;
      case "--question": questions.push(String(argv[++i])); break;
      case "--price-per-mtok": pricePerMtok = Number(argv[++i]); break;
      case "--min-accuracy": minAccuracy = Number(argv[++i]); break;
      case "--max-regressions": maxRegressions = Number(argv[++i]); break;
      case "--show-failures": showFailures = Number(argv[++i]); break;
      case "--format": {
        const v = argv[++i];
        if (v !== "text" && v !== "json") { console.error("jevkit-bench: --format expects text or json"); return EXIT_USAGE; }
        format = v; break;
      }
      case "-h": case "--help": console.log(USAGE); return EXIT_OK;
      default:
        if (arg.startsWith("--")) { console.error(`jevkit-bench: unknown option ${arg}`); return EXIT_USAGE; }
        files.push(arg);
    }
  }

  if (files.length !== 1) { console.error(USAGE); return EXIT_USAGE; }
  if (maxRegressions !== null && !baselinePath) {
    console.error("jevkit-bench: --max-regressions needs --baseline");
    return EXIT_USAGE;
  }

  const options = {
    questionIds: questions.length ? questions : undefined,
    pricePerMtok,
  };

  let suite, baseline;
  try {
    suite = scoreRecords(readRecords(files[0]!), options);
    baseline = baselinePath ? scoreRecords(readRecords(baselinePath), options) : null;
  } catch (err) {
    const message = err instanceof RecordFormatError ? err.message : (err as Error).message;
    console.error(`jevkit-bench: ${message}`);
    return EXIT_USAGE;
  }

  if (!suite.count) {
    console.error(
      "jevkit-bench: nothing scored. Records need a 'label' object keyed by question id.",
    );
    return EXIT_USAGE;
  }

  const comparison = baseline ? compareSuites(baseline, suite) : null;

  if (format === "json") {
    const payload: Record<string, unknown> = { ...suite.toJSON() };
    if (comparison) {
      payload["comparison"] = {
        baselineAccuracy: comparison.baseline.accuracy,
        accuracyDelta: comparison.accuracyDelta,
        costDelta: comparison.costDelta,
        regressions: comparison.regressions,
        fixes: comparison.fixes,
      };
    }
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(suite.summary());
    if (comparison) {
      console.log();
      console.log(comparison.summary());
      if (comparison.regressions.length) {
        console.log("\nregressions:");
        for (const [rid, qid] of comparison.regressions.slice(0, 20)) {
          console.log(`  ${rid.slice(7, 19)}  ${qid}`);
        }
      }
    }
    if (showFailures) {
      const failures = suite.failures().slice(0, showFailures);
      if (failures.length) {
        console.log(`\nmost confident wrong answers (${failures.length}):`);
        for (const f of failures) {
          console.log(
            `  ${f.requestId.slice(7, 19)}  ${f.questionId}: said ` +
            `${JSON.stringify(f.predicted)}, label ${JSON.stringify(f.label)}, ` +
            `p=${f.probability.toFixed(3)}`,
          );
        }
      }
    }
  }

  if (minAccuracy !== null && suite.accuracy < minAccuracy) {
    console.error(`jevkit-bench: accuracy ${suite.accuracy.toFixed(4)} below ${minAccuracy}`);
    return EXIT_FAILED_GATE;
  }
  if (maxRegressions !== null && comparison && comparison.regressions.length > maxRegressions) {
    console.error(
      `jevkit-bench: ${comparison.regressions.length} regressions exceed ${maxRegressions}`,
    );
    return EXIT_FAILED_GATE;
  }
  return EXIT_OK;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) process.exit(main());
