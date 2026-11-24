import { useMemo, useState } from "react";

import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  useNavigation,
} from "@raycast/api";

import { moveName, orderParams } from "../lib/parser";
import type { ParamDef } from "../lib/parser";

interface ParamOrderListProps {
  params: ParamDef[];
  order: string[];
  onReorder: (order: string[]) => void;
}

function describeValue(param: ParamDef | undefined): string {
  if (param?.options) {
    return param.options.join(" | ");
  }
  return param?.defaultValue ?? "required";
}

export default function ParamOrderList(props: ParamOrderListProps) {
  const { params, order, onReorder } = props;

  const { pop } = useNavigation();
  // a pushed view never sees its props change, so the order being edited lives here and is reported back on every move
  const [names, setNames] = useState<string[]>(() =>
    orderParams(params, order).map((param) => param.name),
  );
  const byName = useMemo(
    () => new Map(params.map((param) => [param.name, param])),
    [params],
  );

  const isTemplateOrder = names.every(
    (name, index) => name === params[index].name,
  );

  const move = (name: string, offset: number) => {
    const moved = moveName(names, name, offset);
    setNames(moved);
    onReorder(moved);
  };

  const reset = () => {
    setNames(params.map((param) => param.name));
    onReorder([]);
  };

  return (
    <List
      navigationTitle="Reorder Parameters"
      searchBarPlaceholder="Filter parameters…"
    >
      <List.Section
        title="Parameters"
        subtitle="In the order the form asks for them"
      >
        {names.map((name, index) => (
          <List.Item
            key={name}
            id={name}
            title={name}
            subtitle={describeValue(byName.get(name))}
            accessories={[{ text: `${index + 1} of ${names.length}` }]}
            actions={
              <ActionPanel>
                <Action title="Done" icon={Icon.Checkmark} onAction={pop} />
                {index > 0 ? (
                  <Action
                    title="Move Higher"
                    icon={Icon.ArrowUp}
                    shortcut={Keyboard.Shortcut.Common.MoveUp}
                    onAction={() => move(name, -1)}
                  />
                ) : null}
                {index < names.length - 1 ? (
                  <Action
                    title="Move Lower"
                    icon={Icon.ArrowDown}
                    shortcut={Keyboard.Shortcut.Common.MoveDown}
                    onAction={() => move(name, 1)}
                  />
                ) : null}
                {isTemplateOrder ? null : (
                  <Action
                    title="Reset to Command Order"
                    icon={Icon.ArrowCounterClockwise}
                    onAction={reset}
                  />
                )}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
