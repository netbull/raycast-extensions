import { commandParams } from "./parser";
import type { RunMode, SavedCommand } from "./types";

export interface ParameterInfo {
  name: string;
  required: boolean;
  default?: string;
  choices?: string[];
}

export interface CommandInfo {
  id: string;
  name: string;
  template: string;
  parameters: ParameterInfo[];
  keywords: string[];
  runMode: RunMode;
  workingDirectory?: string;
}

const NAME_WEIGHT = 2;
const BODY_WEIGHT = 1;

export function describeCommand(command: SavedCommand): CommandInfo {
  return {
    id: command.id,
    name: command.name,
    template: command.template,
    parameters: commandParams(command).map((param) => ({
      name: param.name,
      required: param.defaultValue === undefined,
      default: param.defaultValue,
      choices: param.options,
    })),
    keywords: command.keywords,
    runMode: command.runMode,
    workingDirectory: command.cwd,
  };
}

function relevance(command: SavedCommand, terms: string[]): number {
  const name = command.name.toLowerCase();
  const body =
    `${command.keywords.join(" ")} ${command.template}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (name.includes(term)) {
      score += NAME_WEIGHT;
    } else if (body.includes(term)) {
      score += BODY_WEIGHT;
    }
  }
  return score;
}

// any-term matching, best first: a natural-language query carries filler words an all-terms match would choke on
export function rankCommands(
  commands: SavedCommand[],
  query: string,
): SavedCommand[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== "");
  if (terms.length === 0) {
    return commands;
  }
  return commands
    .map((command, index) => ({
      command,
      index,
      score: relevance(command, terms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
}
