import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { runCaptured } from "../src/lib/process";

const LIMITS = { timeoutMs: 10_000, maxOutputChars: 10_000 };

describe("runCaptured", () => {
  it("captures stdout, stderr and the exit code", async () => {
    const result = await runCaptured("echo out; echo err >&2; exit 3", process.env, tmpdir(), LIMITS);

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("out");
    expect(result.output).toContain("err");
    expect(result.timedOut).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it("runs in the given directory", async () => {
    const dir = realpathSync(tmpdir());

    const result = await runCaptured("pwd -P", process.env, dir, LIMITS);

    expect(result.output.trim()).toBe(dir);
    expect(result.exitCode).toBe(0);
  });

  it("keeps only the tail of oversized output", async () => {
    const result = await runCaptured("printf 'aaaaaaaaaa'; printf 'bbbbbbbbbb'", process.env, tmpdir(), {
      timeoutMs: 10_000,
      maxOutputChars: 10,
    });

    expect(result.output).toBe("bbbbbbbbbb");
    expect(result.truncated).toBe(true);
  });

  it("stops a command that outlives the timeout and keeps what it printed", async () => {
    const startedAt = Date.now();

    const result = await runCaptured("echo started; sleep 30", process.env, tmpdir(), {
      timeoutMs: 300,
      maxOutputChars: 1000,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeUndefined();
    expect(result.output).toContain("started");
    expect(Date.now() - startedAt).toBeLessThan(5000);
  });

  it("stops the whole pipeline, not just the wrapper shell", async () => {
    const startedAt = Date.now();

    const result = await runCaptured("sleep 30 | cat", process.env, tmpdir(), {
      timeoutMs: 300,
      maxOutputChars: 1000,
    });

    expect(result.timedOut).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1500);
  });

  it("gives a command that reads stdin an immediate end of input", async () => {
    const result = await runCaptured("cat; echo done", process.env, tmpdir(), LIMITS);

    expect(result.output.trim()).toBe("done");
    expect(result.timedOut).toBe(false);
  });

  it("reports a directory that does not exist instead of hanging", async () => {
    const result = await runCaptured("echo hi", process.env, "/nonexistent-spellbook-dir", LIMITS);

    expect(result.exitCode).toBeUndefined();
    expect(result.output).toContain("ENOENT");
    expect(result.timedOut).toBe(false);
  });
});
