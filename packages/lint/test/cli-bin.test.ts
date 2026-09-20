/**
 * The CLI must run when invoked through a symlink.
 *
 * npm installs a `bin` entry as a symlink into node_modules/.bin, so
 * process.argv[1] is the shim path while import.meta.url is the real file.
 * Comparing them unresolved made every installed CLI silently do nothing and
 * exit 0, which unit tests calling main() directly could never catch.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CLI = resolve(__dirname, "../dist/cli.js");

function run(bin: string, args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [bin, ...args], { encoding: "utf8" });
    return { status: 0, stdout };
  } catch (err) {
    const e = err as { status: number; stdout: string };
    return { status: e.status, stdout: e.stdout ?? "" };
  }
}

describe.skipIf(!existsSync(CLI))("built CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "jevkit-cli-"));
  const request = join(dir, "r.json");
  writeFileSync(
    request,
    JSON.stringify({ questions: { q: { type: "noul", instructions: "How many items are there" } } }),
  );

  it("reports findings when run directly", () => {
    const { status, stdout } = run(CLI, [request, "--no-color"]);
    expect(stdout).toContain("JEV001");
    expect(status).toBe(1);
  });

  it("reports findings when run through a symlink, as npm installs it", () => {
    const link = join(dir, "jevkit-lint-shim.js");
    symlinkSync(CLI, link);
    const { status, stdout } = run(link, [request, "--no-color"]);
    expect(stdout, "CLI produced no output through a symlink").toContain("JEV001");
    expect(status).toBe(1);
  });
});
