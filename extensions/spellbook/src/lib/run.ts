import { detectDanger } from "./danger";
import { expandPath } from "./library";
import { commandParams, shellQuote, substitute } from "./parser";
import type { DangerMatch } from "./danger";
import type { SavedCommand } from "./types";

export interface RunPlan {
  resolved: string;
  cwd: string;
  terminalCommand: string;
  danger: DangerMatch | undefined;
}

export interface ParameterValue {
  name: string;
  value: string;
}

export function planRun(command: SavedCommand, resolved: string): RunPlan {
  const configured = command.cwd ?? "";
  const cwd = expandPath(configured === "" ? "~" : configured);
  return {
    resolved,
    cwd,
    // an inline run gets its directory from spawn; a terminal session has to cd there itself
    terminalCommand:
      configured === "" ? resolved : `cd ${shellQuote(cwd)} && ${resolved}`,
    danger: detectDanger(resolved),
  };
}

// strict counterpart of the override form for callers that cannot be shown one: every problem is reported instead of silently falling back
export function resolveInvocation(
  command: SavedCommand,
  provided: ParameterValue[] = [],
): string {
  const params = new Map(
    commandParams(command).map((param) => [param.name, param]),
  );
  const values: Record<string, string> = {};
  for (const { name, value } of provided) {
    const param = params.get(name);
    if (!param) {
      throw new Error(
        params.size === 0
          ? `"${command.name}" takes no parameters.`
          : `"${command.name}" has no parameter "${name}". Its parameters are: ${[...params.keys()].join(", ")}.`,
      );
    }
    if (param.options && value !== "" && !param.options.includes(value)) {
      throw new Error(
        `"${value}" is not a valid value for "${name}". Choose one of: ${param.options.join(", ")}.`,
      );
    }
    values[name] = value;
  }
  const { command: resolved, missing } = substitute(command.template, values);
  if (missing.length > 0) {
    // named in the order the form would ask for them
    const names = [...params.keys()].filter((name) => missing.includes(name));
    throw new Error(
      `Missing required parameter${names.length === 1 ? "" : "s"}: ${names.join(", ")}.`,
    );
  }
  return resolved;
}
