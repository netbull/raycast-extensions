import { runAppleScript } from "@raycast/utils";

import type { TerminalApp } from "./types";

// the command travels as an argv item and is never interpolated into the script, so quotes, backslashes and newlines reach the shell untouched
const TERMINAL_SCRIPT = `
on run argv
  set shellCommand to item 1 of argv
  tell application "Terminal"
    set coldStart to not running
    activate
    if coldStart then
      -- a cold launch opens its own window a moment after activate returns; reuse it instead of leaving it empty
      set attempts to 0
      repeat while (count of windows) is 0 and attempts < 50
        delay 0.1
        set attempts to attempts + 1
      end repeat
    end if
    if coldStart and (count of windows) > 0 then
      do script shellCommand in window 1
    else
      do script shellCommand
    end if
  end tell
end run
`;

const ITERM_SCRIPT = `
on run argv
  set shellCommand to item 1 of argv
  tell application "iTerm"
    set coldStart to not running
    activate
    if coldStart then
      -- a cold launch opens its own window a moment after activate returns; reuse it instead of adding a second one
      set attempts to 0
      repeat while (count of windows) is 0 and attempts < 50
        delay 0.1
        set attempts to attempts + 1
      end repeat
    end if
    if (count of windows) is 0 then
      create window with default profile
    else if not coldStart then
      tell current window to create tab with default profile
    end if
    tell current session of current window to write text shellCommand
  end tell
end run
`;

export function terminalName(app: TerminalApp): string {
  return app === "iTerm" ? "iTerm2" : "Terminal";
}

export async function runInTerminal(
  command: string,
  app: TerminalApp,
): Promise<void> {
  // no timeout: the first handoff waits on the macOS Automation permission prompt
  await runAppleScript(
    app === "iTerm" ? ITERM_SCRIPT : TERMINAL_SCRIPT,
    [command],
    { timeout: 0 },
  );
}
