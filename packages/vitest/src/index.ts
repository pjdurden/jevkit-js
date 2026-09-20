/**
 * Record and replay TypeSafe Jev requests in vitest.
 *
 * Cassettes are `.jevl` files, the same format the drift, bench and calibrate
 * packages read, so a recording made by your tests doubles as a golden set.
 */

export {
  Cassette, CassetteMiss, ReplayedResponse, type CassetteOptions, type Mode,
  type SystemOneCallable,
} from "./cassette.js";
export {
  assertAnswer, assertConfident, describeAnswer, type AssertAnswerOptions,
} from "./assertions.js";
export { cassetteFor, modeFromEnv, type CassetteForOptions } from "./fixture.js";

export const VERSION = "0.1.0";
