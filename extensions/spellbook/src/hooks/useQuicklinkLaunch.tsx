import { useEffect, useRef, useState } from "react";

import { PopToRootType, showToast, Toast, useNavigation } from "@raycast/api";

import OverrideForm from "../components/OverrideForm";
import { runSavedCommand } from "../components/runSavedCommand";
import { effectiveValues, parseTemplate } from "../lib/parser";
import { parseQuicklinkContext, quicklinkToken } from "../lib/quicklink";
import { readUsage } from "../lib/usage";
import type { QuicklinkContext } from "../lib/quicklink";
import type { SavedCommand } from "../lib/types";
import type { LastAction } from "../lib/usage";

interface QuicklinkLaunchOptions {
  launchContext: unknown;
  commands: SavedCommand[];
  isReady: boolean;
  onUsed: (
    command: SavedCommand,
    action: LastAction,
    values: Record<string, string>,
  ) => void;
}

// returns true while a quicklink launch is still deciding which view to show
export function useQuicklinkLaunch(options: QuicklinkLaunchOptions): boolean {
  const { launchContext, commands, isReady, onUsed } = options;

  const { push } = useNavigation();
  const [pending, setPending] = useState<QuicklinkContext | undefined>(() =>
    parseQuicklinkContext(launchContext),
  );
  const hasStarted = useRef(false);

  useEffect(() => {
    if (pending === undefined || !isReady || hasStarted.current) {
      return;
    }
    hasStarted.current = true;

    const launch = async () => {
      const command = commands.find((entry) => entry.id === pending.commandId);
      if (!command) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Saved command not found",
          message:
            "This quicklink points to a command that is not in your library",
        });
        return;
      }
      const usage = await readUsage(command.id);
      const used = (action: LastAction, values: Record<string, string>) =>
        onUsed(command, action, values);
      if (pending.token !== (await quicklinkToken())) {
        // a link this Raycast did not create never runs by itself — it only opens the form for review
        push(
          <OverrideForm
            command={command}
            lastValues={usage?.values}
            onUsed={used}
          />,
        );
        return;
      }
      await runSavedCommand({
        command,
        values: effectiveValues(parseTemplate(command.template), usage?.values),
        push,
        popToRootType: PopToRootType.Immediate,
        onUsed: used,
      });
    };

    void launch()
      .catch((error: unknown) =>
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to run quicklink",
          message: String(error),
        }),
      )
      .finally(() => setPending(undefined));
  }, [pending, isReady, commands, push, onUsed]);

  return pending !== undefined;
}
