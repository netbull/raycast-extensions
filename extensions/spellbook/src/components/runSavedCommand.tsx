import { PopToRootType } from "@raycast/api";

import { substitute } from "../lib/parser";
import type { SavedCommand } from "../lib/types";
import type { LastAction } from "../lib/usage";
import OverrideForm from "./OverrideForm";
import { performRun } from "./runCommand";
import type { PushFn } from "./runCommand";

export interface RunSavedCommandOptions {
  command: SavedCommand;
  values: Record<string, string>;
  push: PushFn;
  popToRootType?: PopToRootType;
  onUsed: (action: LastAction, values: Record<string, string>) => void;
}

export async function runSavedCommand(
  options: RunSavedCommandOptions,
): Promise<void> {
  const { command, values, push, popToRootType, onUsed } = options;

  const { command: resolved, missing } = substitute(command.template, values);
  if (missing.length > 0) {
    // seed the form with the values this run was asked to use, so "Run with Default Values" cannot leak memory back in
    push(
      <OverrideForm command={command} lastValues={values} onUsed={onUsed} />,
    );
    return;
  }
  await performRun({
    command,
    resolved,
    push,
    popToRootType,
    onWillRun: () => onUsed("run", values),
  });
}
