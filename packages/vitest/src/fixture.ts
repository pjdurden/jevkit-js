/**
 * Test-runner glue.
 *
 * vitest has no fixture-injection system like pytest's, so this is a helper
 * rather than a plugin: call `cassetteFor` in a test and you get the same
 * per-test file naming and the same environment-driven mode switching.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { Cassette, type Mode, type SystemOneCallable } from "./cassette.js";

/**
 * Mode from the environment, so CI and local runs differ without code changes.
 *
 * `JEV_RERECORD=1` replaces every recording, `JEV_RECORD=1` records only what
 * is missing, and the default replays and fails on a miss.
 */
export function modeFromEnv(env: NodeJS.ProcessEnv = process.env): Mode {
  if (env["JEV_RERECORD"]) return "record";
  if (env["JEV_RECORD"]) return "auto";
  return "replay";
}

export interface CassetteForOptions {
  dir?: string;
  systemOne?: SystemOneCallable;
  model?: string;
  mode?: Mode;
}

/**
 * A cassette named after the test.
 *
 * ```ts
 * const cassette = cassetteFor("routes billing questions", { systemOne });
 * ```
 *
 * The name is slugified so one test's recordings never collide with another's.
 */
export function cassetteFor(name: string, options: CassetteForOptions = {}): Cassette {
  const dir = options.dir ?? join(process.cwd(), "test", "cassettes");
  const safe = [...name].map((c) => (/[A-Za-z0-9\-_.]/.test(c) ? c : "_")).join("");
  const path = join(dir, `${safe}.jevl`);
  mkdirSync(dirname(path), { recursive: true });
  return new Cassette(path, {
    systemOne: options.systemOne,
    model: options.model,
    mode: options.mode ?? modeFromEnv(),
  });
}
