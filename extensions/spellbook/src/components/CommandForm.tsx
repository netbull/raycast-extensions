import { useMemo, useState } from "react";

import {
  Action,
  ActionPanel,
  Form,
  Icon,
  Keyboard,
  popToRoot,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";

import { buildSavedCommand } from "../lib/library";
import {
  hasMalformedPlaceholder,
  orderParams,
  parseTemplate,
  substitute,
} from "../lib/parser";
import { writeCommand } from "../lib/store";
import type { ParamDef } from "../lib/parser";
import type { RunMode, SavedCommand } from "../lib/types";
import ParamOrderList from "./ParamOrderList";

interface CommandFormProps {
  command?: SavedCommand;
  prefillTemplate?: string;
  popToRootAfterSave?: boolean;
  onSaved?: () => void;
}

interface CommandFormState {
  name: string;
  template: string;
  keywords: string;
  runMode: RunMode;
  cwd: string;
  paramOrder: string[];
}

// the hint spells the shortcut out, so the two stay next to each other
const REORDER_SHORTCUT: Keyboard.Shortcut = {
  modifiers: ["cmd", "shift"],
  key: "r",
};
const REORDER_HINT = "Asked in this order. Press ⌘⇧R to reorder.";

function describeParam(param: ParamDef): string {
  if (param.options) {
    return `${param.name} = ${param.options.join(" | ")}`;
  }
  if (param.defaultValue !== undefined) {
    return `${param.name} = ${param.defaultValue}`;
  }
  return `${param.name} (required)`;
}

export default function CommandForm(props: CommandFormProps) {
  const {
    command,
    prefillTemplate,
    popToRootAfterSave = false,
    onSaved,
  } = props;

  const { pop, push } = useNavigation();
  const [state, setState] = useState<CommandFormState>(() => ({
    name: command?.name ?? "",
    template: command?.template ?? prefillTemplate ?? "",
    keywords: command?.keywords.join(", ") ?? "",
    runMode: command?.runMode ?? "inline",
    cwd: command?.cwd ?? "",
    paramOrder: command?.paramOrder ?? [],
  }));
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [templateError, setTemplateError] = useState<string | undefined>(
    undefined,
  );

  const templateParams = useMemo(
    () => parseTemplate(state.template),
    [state.template],
  );
  const params = useMemo(
    () => orderParams(templateParams, state.paramOrder),
    [templateParams, state.paramOrder],
  );
  const preview = useMemo(
    () => substitute(state.template, {}),
    [state.template],
  );

  const setField = <Key extends keyof CommandFormState>(
    key: Key,
    value: CommandFormState[Key],
  ) => {
    setState((previous) => ({ ...previous, [key]: value }));
  };

  const openParamOrder = () => {
    push(
      <ParamOrderList
        params={templateParams}
        order={state.paramOrder}
        onReorder={(order) => setField("paramOrder", order)}
      />,
    );
  };

  const baseParamsText =
    params.length === 0
      ? "No parameters detected. Wrap values as {{name=default}} or {{name=a|b|c}}."
      : params.map(describeParam).join("\n");
  const paramsText = hasMalformedPlaceholder(state.template)
    ? `⚠ Malformed {{…}} placeholder — escape a literal } inside a default as \\}\n${baseParamsText}`
    : baseParamsText;
  // as a command's root view the form keeps Raycast's automatic title; only pushed forms name themselves
  const pushedTitle = command ? "Edit Command" : "Save Command";

  const handleSave = async () => {
    const name = state.name.trim();
    const template = state.template.trim();
    if (name === "") {
      setNameError("Name is required");
    }
    if (template === "") {
      setTemplateError("Command is required");
    }
    if (name === "" || template === "") {
      return;
    }
    const saved = buildSavedCommand(
      {
        name,
        template,
        keywords: state.keywords.split(","),
        runMode: state.runMode,
        cwd: state.cwd,
        paramOrder: state.paramOrder,
      },
      command,
    );
    try {
      writeCommand(saved);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save",
        message: String(error),
      });
      return;
    }
    await showToast({
      style: Toast.Style.Success,
      title: command ? "Command updated" : "Command saved",
    });
    onSaved?.();
    if (popToRootAfterSave) {
      await popToRoot();
    } else {
      pop();
    }
  };

  return (
    <Form
      navigationTitle={popToRootAfterSave ? undefined : pushedTitle}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={command ? "Update Command" : "Save Command"}
            icon={Icon.SaveDocument}
            onSubmit={() => void handleSave()}
          />
          {params.length > 1 ? (
            <Action
              title="Reorder Parameters"
              icon={Icon.ChevronUpDown}
              shortcut={REORDER_SHORTCUT}
              onAction={openParamOrder}
            />
          ) : null}
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="Tail prod docker logs"
        value={state.name}
        error={nameError}
        onChange={(value) => {
          setField("name", value);
          if (value.trim() !== "") {
            setNameError(undefined);
          }
        }}
        autoFocus
      />
      <Form.TextArea
        id="template"
        title="Command"
        placeholder="docker logs -f --tail {{lines=100}} {{container=api|worker|db}}"
        value={state.template}
        error={templateError}
        onChange={(value) => {
          setField("template", value);
          if (value.trim() !== "") {
            setTemplateError(undefined);
          }
        }}
      />
      <Form.Description title="Parameters" text={paramsText} />
      {params.length > 1 ? <Form.Description text={REORDER_HINT} /> : null}
      {params.length > 0 && preview.missing.length === 0 ? (
        <Form.Description title="With defaults" text={preview.command} />
      ) : null}
      <Form.TextField
        id="keywords"
        title="Keywords"
        placeholder="docker, logs (comma-separated, improves search)"
        value={state.keywords}
        onChange={(value) => setField("keywords", value)}
      />
      <Form.Dropdown
        id="runMode"
        title="Run Mode"
        value={state.runMode}
        onChange={(value) =>
          setField("runMode", value === "terminal" ? "terminal" : "inline")
        }
      >
        <Form.Dropdown.Item
          value="inline"
          title="Inline (show output in Raycast)"
        />
        <Form.Dropdown.Item
          value="terminal"
          title="Terminal (hand off; for interactive commands)"
        />
      </Form.Dropdown>
      <Form.TextField
        id="cwd"
        title="Working Directory"
        placeholder="~ (default)"
        value={state.cwd}
        onChange={(value) => setField("cwd", value)}
      />
    </Form>
  );
}
