import { describeCommand, rankCommands } from "../lib/describe";
import { readLibrary } from "../lib/store";

const MAX_RESULTS = 50;

type Input = {
  /**
   * Optional words to look for in the commands' names, keywords and templates, for example "docker logs". Leave it out to list the whole library.
   */
  query?: string;
};

/**
 * List the shell command templates saved in the user's Spellbook library. Each entry has the id that run-command needs, the template, and its parameters with their defaults, allowed choices and whether they are required.
 */
export default function tool(input: Input) {
  const { commands } = readLibrary();
  const matches = rankCommands(
    commands,
    typeof input.query === "string" ? input.query : "",
  );
  return {
    total: commands.length,
    matched: matches.length,
    commands: matches.slice(0, MAX_RESULTS).map(describeCommand),
  };
}
