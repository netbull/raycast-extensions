import { spawn } from "node:child_process";

import { defaultShell } from "./shellEnv";

const KILL_GRACE_MS = 2000;

export interface CaptureLimits {
  timeoutMs: number;
  maxOutputChars: number;
}

export interface CapturedRun {
  exitCode: number | undefined;
  output: string;
  truncated: boolean;
  timedOut: boolean;
}

export function spawnInline(
  command: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
) {
  return spawn(defaultShell(), ["-c", command], {
    env,
    cwd,
    // detached puts the shell in its own process group so killInline reaches pipeline children, not just the wrapper shell
    detached: true,
    // nobody can type into an inline run, so a command that prompts should hit EOF instead of waiting forever
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function killInline(
  child: ReturnType<typeof spawnInline> | undefined,
  signal: NodeJS.Signals = "SIGTERM",
): void {
  if (child?.pid === undefined) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    // process group already gone
  }
}

export function runCaptured(
  command: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
  limits: CaptureLimits,
): Promise<CapturedRun> {
  return new Promise((resolve) => {
    const child = spawnInline(command, env, cwd);
    let output = "";
    let truncated = false;
    let timedOut = false;
    let exitCode: number | undefined;
    let hardStop: ReturnType<typeof setTimeout> | undefined;

    const append = (chunk: string) => {
      output += chunk;
      if (output.length > limits.maxOutputChars) {
        // the tail is what explains how a command ended
        output = output.slice(output.length - limits.maxOutputChars);
        truncated = true;
      }
    };

    const finish = () => {
      clearTimeout(timer);
      clearTimeout(hardStop);
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({ exitCode, output, truncated, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killInline(child);
      hardStop = setTimeout(() => {
        killInline(child, "SIGKILL");
        // a grandchild that left the process group can hold the pipes open, so "close" may never come
        finish();
      }, KILL_GRACE_MS);
    }, limits.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("exit", (code) => {
      exitCode = code ?? undefined;
    });
    child.on("error", (error) => {
      append(`${output === "" ? "" : "\n"}${String(error)}`);
      finish();
    });
    child.on("close", finish);
  });
}
