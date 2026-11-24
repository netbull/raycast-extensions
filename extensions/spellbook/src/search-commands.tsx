import { useCallback, useEffect, useState } from "react";

import { Action, ActionPanel, Icon, List, useNavigation } from "@raycast/api";
import { useFrecencySorting } from "@raycast/utils";
import type { LaunchProps } from "@raycast/api";

import CommandForm from "./components/CommandForm";
import CommandListItem from "./components/CommandListItem";
import { useQuicklinkLaunch } from "./hooks/useQuicklinkLaunch";
import { useQuicklinkToken } from "./hooks/useQuicklinkToken";
import { readLibrary } from "./lib/store";
import { readUsageState, saveUsage, usageEntry } from "./lib/usage";
import type { SavedCommand } from "./lib/types";
import type { LastAction, UsageState } from "./lib/usage";

export default function SearchCommands(props: LaunchProps) {
  const { launchContext } = props;

  const [commands, setCommands] = useState<SavedCommand[]>([]);
  const [usage, setUsage] = useState<UsageState>({});
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const { push } = useNavigation();
  const quicklinkToken = useQuicklinkToken();
  const { data: sortedCommands, visitItem } = useFrecencySorting(commands, {
    key: (item) => item.id,
  });

  const reload = useCallback(() => {
    try {
      setCommands(readLibrary().commands);
      setLoadError(undefined);
    } catch (error) {
      setCommands([]);
      setLoadError(String(error));
    }
    void readUsageState().then(setUsage);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const recordUse = useCallback(
    (
      command: SavedCommand,
      action: LastAction,
      values: Record<string, string>,
    ) => {
      const entry = usageEntry(command, action, values);
      setUsage((previous) => ({ ...previous, [command.id]: entry }));
      void saveUsage(command.id, entry);
      void visitItem(command);
    },
    [visitItem],
  );

  const isLaunching = useQuicklinkLaunch({
    launchContext,
    commands,
    isReady: !isLoading,
    onUsed: recordUse,
    onReload: reload,
  });
  const isBusy = isLoading || isLaunching;

  return (
    <List
      isLoading={isBusy}
      isShowingDetail={isShowingDetail && sortedCommands.length > 0}
      searchBarPlaceholder="Search your spellbook…"
    >
      {isBusy ? null : (
        <List.EmptyView
          icon={loadError === undefined ? Icon.Book : Icon.Warning}
          title={
            loadError === undefined
              ? "Your Spellbook is empty"
              : "Failed to load library"
          }
          description={
            loadError === undefined
              ? "Save your first command with {{param=default}} placeholders"
              : `${loadError} — fix the file and reload`
          }
          actions={
            <ActionPanel>
              <Action
                title="Save First Command"
                icon={Icon.Plus}
                onAction={() => push(<CommandForm onSaved={reload} />)}
              />
              <Action
                title="Reload Library"
                icon={Icon.ArrowClockwise}
                onAction={reload}
              />
            </ActionPanel>
          }
        />
      )}
      {isLaunching
        ? null
        : sortedCommands.map((command) => (
            <CommandListItem
              key={command.id}
              command={command}
              usage={usage[command.id]}
              quicklinkToken={quicklinkToken}
              isShowingDetail={isShowingDetail}
              onToggleDetail={() => setIsShowingDetail((previous) => !previous)}
              onReload={reload}
              onUsed={(action, values) => recordUse(command, action, values)}
            />
          ))}
    </List>
  );
}
