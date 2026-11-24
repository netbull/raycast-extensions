import { useMemo, useState } from "react";

import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Form,
  Icon,
  Keyboard,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";

import { useParamOrder } from "../hooks/useParamOrder";
import {
  effectiveValues,
  firstParamToFill,
  moveName,
  substitute,
} from "../lib/parser";
import type { SavedCommand } from "../lib/types";
import type { LastAction } from "../lib/usage";
import ParamField from "./ParamField";
import ParamOrderList from "./ParamOrderList";
import { performRun } from "./runCommand";

interface OverrideFormProps {
  command: SavedCommand;
  lastValues?: Record<string, string>;
  onUsed?: (action: LastAction, values: Record<string, string>) => void;
  onReordered?: () => void;
}

interface FocusRequest {
  name: string;
  token: number;
}

export default function OverrideForm(props: OverrideFormProps) {
  const { command, lastValues, onUsed, onReordered } = props;

  const { push } = useNavigation();
  const { templateParams, params, order, applyOrder } = useParamOrder(
    command,
    onReordered,
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    effectiveValues(templateParams, lastValues),
  );
  // decided once from the starting values, so the focus does not jump to the next field while typing
  const [initialFocus] = useState(() =>
    firstParamToFill(params, effectiveValues(params, lastValues)),
  );
  const [focusedName, setFocusedName] = useState(initialFocus);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | undefined>(
    undefined,
  );

  const { command: resolved, missing } = useMemo(
    () => substitute(command.template, values),
    [command.template, values],
  );

  const names = params.map((param) => param.name);
  const focusedIndex =
    focusedName === undefined ? -1 : names.indexOf(focusedName);

  const setValue = (name: string, value: string) => {
    setValues((previous) => ({ ...previous, [name]: value }));
  };

  const moveFocused = (offset: number) => {
    if (focusedName === undefined) {
      return;
    }
    const moved = moveName(names, focusedName, offset);
    if (moved === names) {
      return;
    }
    applyOrder(moved);
    setFocusRequest((previous) => ({
      name: focusedName,
      token: (previous?.token ?? 0) + 1,
    }));
  };

  const openParamOrder = () => {
    push(
      <ParamOrderList
        params={templateParams}
        order={order}
        onReorder={applyOrder}
      />,
    );
  };

  const showMissingToast = async () => {
    await showToast({
      style: Toast.Style.Failure,
      title: "Missing required parameters",
      message: missing.join(", "),
    });
  };

  const handleRun = async () => {
    if (missing.length > 0) {
      await showMissingToast();
      return;
    }
    await performRun({
      command,
      resolved,
      push,
      onWillRun: () => onUsed?.("run", values),
    });
  };

  const handleCopy = async () => {
    if (missing.length > 0) {
      await showMissingToast();
      return;
    }
    await Clipboard.copy(resolved);
    onUsed?.("copy", values);
    await showHUD("Copied to clipboard");
  };

  const handlePaste = async () => {
    if (missing.length > 0) {
      await showMissingToast();
      return;
    }
    onUsed?.("paste", values);
    await closeMainWindow();
    await Clipboard.paste(resolved);
  };

  return (
    <Form
      navigationTitle={command.name}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Run"
            icon={Icon.Play}
            onSubmit={() => void handleRun()}
          />
          <Action
            title="Copy Command"
            icon={Icon.CopyClipboard}
            shortcut={Keyboard.Shortcut.Common.Copy}
            onAction={() => void handleCopy()}
          />
          <Action
            title="Paste to Frontmost App"
            icon={Icon.Clipboard}
            shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
            onAction={() => void handlePaste()}
          />
          {params.length > 1 ? (
            <ActionPanel.Section
              title={
                focusedIndex < 0 ? "Parameter Order" : `Order of ${focusedName}`
              }
            >
              {focusedIndex > 0 ? (
                <Action
                  title="Move Higher"
                  icon={Icon.ArrowUp}
                  shortcut={Keyboard.Shortcut.Common.MoveUp}
                  onAction={() => moveFocused(-1)}
                />
              ) : null}
              {focusedIndex >= 0 && focusedIndex < names.length - 1 ? (
                <Action
                  title="Move Lower"
                  icon={Icon.ArrowDown}
                  shortcut={Keyboard.Shortcut.Common.MoveDown}
                  onAction={() => moveFocused(1)}
                />
              ) : null}
              <Action
                title="Reorder Parameters"
                icon={Icon.ChevronUpDown}
                shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                onAction={openParamOrder}
              />
            </ActionPanel.Section>
          ) : null}
        </ActionPanel>
      }
    >
      <Form.Description
        title="Will run"
        text={missing.length > 0 ? `Missing: ${missing.join(", ")}` : resolved}
      />
      {params.map((param) => (
        <ParamField
          key={param.name}
          param={param}
          value={values[param.name] ?? ""}
          autoFocus={param.name === initialFocus}
          focusToken={
            focusRequest?.name === param.name ? focusRequest.token : undefined
          }
          onChange={setValue}
          onFocus={setFocusedName}
        />
      ))}
    </Form>
  );
}
