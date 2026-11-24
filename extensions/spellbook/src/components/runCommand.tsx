import {
  Alert,
  closeMainWindow,
  confirmAlert,
  PopToRootType,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";

import { planRun } from "../lib/run";
import { preferredTerminal } from "../lib/store";
import { runInTerminal, terminalName } from "../lib/terminal";
import type { RunPlan } from "../lib/run";
import type { SavedCommand } from "../lib/types";
import RunOutput from "./RunOutput";

export type PushFn = ReturnType<typeof useNavigation>["push"];

export interface PerformRunOptions {
  command: SavedCommand;
  resolved: string;
  push: PushFn;
  popToRootType?: PopToRootType;
  onWillRun?: () => void;
}

async function confirmDanger(plan: RunPlan): Promise<boolean> {
  if (!plan.danger) {
    return true;
  }
  return confirmAlert({
    title: "Run dangerous command?",
    message: `Detected: ${plan.danger.label}\n\n${plan.resolved}`,
    primaryAction: { title: "Run", style: Alert.ActionStyle.Destructive },
  });
}

async function handOffToTerminal(
  plan: RunPlan,
  popToRootType: PopToRootType,
): Promise<void> {
  const terminal = preferredTerminal();
  try {
    await closeMainWindow();
    await runInTerminal(plan.terminalCommand, terminal);
    // popping to root unloads the command, so it is only requested once the terminal has the text
    await showHUD(`Sent to ${terminalName(terminal)}`, { popToRootType });
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Terminal handoff failed",
      message: String(error),
    });
  }
}

export async function performRun(options: PerformRunOptions): Promise<void> {
  const {
    command,
    resolved,
    push,
    popToRootType = PopToRootType.Default,
    onWillRun,
  } = options;

  const plan = planRun(command, resolved);
  if (!(await confirmDanger(plan))) {
    return;
  }

  onWillRun?.();

  if (command.runMode === "terminal") {
    await handOffToTerminal(plan, popToRootType);
    return;
  }

  push(<RunOutput title={command.name} command={resolved} cwd={plan.cwd} />);
}
