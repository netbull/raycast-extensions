import { existsSync } from "node:fs";

import { Action } from "@raycast/api";
import type { Tool } from "@raycast/api";

import { getShellEnv } from "../lib/exec";
import { runCaptured } from "../lib/process";
import { planRun, resolveInvocation } from "../lib/run";
import { preferredTerminal, readLibrary } from "../lib/store";
import { runInTerminal, terminalName } from "../lib/terminal";
import type { RunPlan } from "../lib/run";
import type { SavedCommand } from "../lib/types";

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 16_000;

type Input = {
  /**
   * The id of the saved command to run, exactly as returned by get-commands. Never guess it.
   */
  id: string;
  /**
   * Values for the command's parameters, matched by name. Leave a parameter out to use its default; a parameter without a default is required. Pass each value exactly as the user means it: values are shell-quoted automatically, so never add quotes or escapes.
   */
  parameters?: {
    /**
     * The parameter name as listed by get-commands.
     */
    name: string;
    /**
     * The value to substitute for the parameter.
     */
    value: string;
  }[];
};

interface PreparedRun {
  command: SavedCommand;
  plan: RunPlan;
}

// a model can ignore the schema, so nothing is assumed about what actually arrives
function asText(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function prepare(input: Input): PreparedRun {
  const command = readLibrary().commands.find((entry) => entry.id === input.id);
  if (!command) {
    throw new Error(
      `No saved command has the id "${asText(input.id)}". Call get-commands to look up the right id.`,
    );
  }
  const parameters: unknown[] = Array.isArray(input.parameters)
    ? input.parameters
    : [];
  const provided = parameters.map((parameter) => {
    const { name, value } = (parameter ?? {}) as Record<string, unknown>;
    return { name: asText(name), value: asText(value) };
  });
  return {
    command,
    plan: planRun(command, resolveInvocation(command, provided)),
  };
}

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  let prepared: PreparedRun;
  try {
    prepared = prepare(input);
  } catch {
    // nothing can run from this input, so there is nothing to confirm — the tool itself reports why
    return undefined;
  }
  const { command, plan } = prepared;
  return {
    style: plan.danger ? Action.Style.Destructive : Action.Style.Regular,
    message: plan.danger
      ? `Run this command? Detected: ${plan.danger.label}.`
      : "Run this command?",
    info: [
      { name: "Command", value: plan.resolved },
      { name: "Saved As", value: command.name },
      { name: "Directory", value: plan.cwd },
      {
        name: "Runs In",
        value:
          command.runMode === "terminal"
            ? terminalName(preferredTerminal())
            : "Raycast",
      },
    ],
  };
};

/**
 * Run one of the user's saved Spellbook commands with its parameters filled in. The user always sees the exact command and confirms it first. Inline commands return their output and exit code; terminal commands are handed off to the user's terminal and return no output.
 */
export default async function tool(input: Input) {
  const { command, plan } = prepare(input);

  if (command.runMode === "terminal") {
    const terminal = preferredTerminal();
    await runInTerminal(plan.terminalCommand, terminal);
    return {
      name: command.name,
      command: plan.resolved,
      note: `Handed off to ${terminalName(terminal)}. Its output is not available here.`,
    };
  }

  if (!existsSync(plan.cwd)) {
    throw new Error(`The working directory does not exist: ${plan.cwd}`);
  }
  const result = await runCaptured(
    plan.resolved,
    await getShellEnv(),
    plan.cwd,
    { timeoutMs: TIMEOUT_MS, maxOutputChars: MAX_OUTPUT_CHARS },
  );
  return {
    name: command.name,
    command: plan.resolved,
    directory: plan.cwd,
    ...result,
    note: result.timedOut
      ? `Stopped after ${TIMEOUT_MS / 1000} seconds, so the output is partial. Long-running commands belong in the Terminal run mode.`
      : undefined,
  };
}
