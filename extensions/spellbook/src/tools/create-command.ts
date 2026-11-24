import type { Tool } from "@raycast/api";

import { describeCommand } from "../lib/describe";
import { buildSavedCommand } from "../lib/library";
import { hasMalformedPlaceholder } from "../lib/parser";
import { preferredTerminal, readLibrary, writeCommand } from "../lib/store";
import { terminalName } from "../lib/terminal";
import type { SavedCommand } from "../lib/types";

type Input = {
  /**
   * A short name to find the command by, for example "Tail Docker Logs".
   */
  name: string;
  /**
   * The shell command with its variable parts written as placeholders: {{name}} is required, {{name=default}} has a default value, and {{name=a|b|c}} is a choice list whose first option is the default. Use the same name twice to reuse one value. Write \{{ for a literal {{ that is not a placeholder.
   */
  template: string;
  /**
   * Extra words that help find the command, such as the tool or project it belongs to.
   */
  keywords?: string[];
  /**
   * Use "terminal" for interactive or long-running commands such as ssh or a log tail. Otherwise use "inline", which shows the output in Raycast.
   */
  runMode?: "inline" | "terminal";
  /**
   * The directory to run in, absolute or starting with ~. Leave it out to run in the home directory.
   */
  workingDirectory?: string;
};

function prepare(input: Input): SavedCommand {
  const draft = buildSavedCommand({
    name: String(input.name ?? ""),
    template: String(input.template ?? ""),
    keywords: Array.isArray(input.keywords) ? input.keywords.map(String) : [],
    runMode: input.runMode === "terminal" ? "terminal" : "inline",
    cwd:
      typeof input.workingDirectory === "string"
        ? input.workingDirectory
        : undefined,
  });
  if (draft.name === "" || draft.template === "") {
    throw new Error("A saved command needs both a name and a template.");
  }
  if (hasMalformedPlaceholder(draft.template)) {
    throw new Error(
      "The template has a malformed {{…}} placeholder. Close every placeholder, and write a literal } inside a default as \\}.",
    );
  }
  const taken = readLibrary().commands.some(
    (existing) => existing.name.toLowerCase() === draft.name.toLowerCase(),
  );
  if (taken) {
    throw new Error(
      `A command named "${draft.name}" already exists. Choose a different name.`,
    );
  }
  return draft;
}

function summarizeParameters(command: SavedCommand): string {
  const { parameters } = describeCommand(command);
  if (parameters.length === 0) {
    return "None";
  }
  return parameters
    .map((parameter) => {
      if (parameter.choices) {
        return `${parameter.name} (${parameter.choices.join(" | ")})`;
      }
      return parameter.default === undefined
        ? `${parameter.name} (required)`
        : `${parameter.name} (default ${parameter.default})`;
    })
    .join(", ");
}

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  let command: SavedCommand;
  try {
    command = prepare(input);
  } catch {
    // nothing would be saved from this input, so there is nothing to confirm — the tool itself reports why
    return undefined;
  }
  return {
    message: "Save this command to Spellbook?",
    info: [
      { name: "Name", value: command.name },
      { name: "Command", value: command.template },
      { name: "Parameters", value: summarizeParameters(command) },
      {
        name: "Runs In",
        value:
          command.runMode === "terminal"
            ? terminalName(preferredTerminal())
            : "Raycast",
      },
      { name: "Directory", value: command.cwd },
    ],
  };
};

/**
 * Save a new shell command template to the user's Spellbook library so it can be found and run later. Turn the parts of the command that change between runs into placeholders.
 */
export default function tool(input: Input) {
  const command = prepare(input);
  writeCommand(command);
  return describeCommand(command);
}
