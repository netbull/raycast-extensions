import { useMemo, useState } from "react";

import { showToast, Toast } from "@raycast/api";

import { orderParams, parseTemplate } from "../lib/parser";
import { saveParamOrder } from "../lib/store";
import type { ParamDef } from "../lib/parser";
import type { SavedCommand } from "../lib/types";

interface ParamOrder {
  templateParams: ParamDef[];
  params: ParamDef[];
  order: string[];
  applyOrder: (order: string[]) => void;
}

// a pushed view never sees its command prop change, so the order it shows lives here and every change is written to the library straight away
export function useParamOrder(
  command: SavedCommand,
  onReordered?: () => void,
): ParamOrder {
  const [order, setOrder] = useState<string[]>(command.paramOrder ?? []);
  const templateParams = useMemo(
    () => parseTemplate(command.template),
    [command.template],
  );
  const params = useMemo(
    () => orderParams(templateParams, order),
    [templateParams, order],
  );

  const applyOrder = (next: string[]) => {
    try {
      saveParamOrder(command.id, next);
    } catch (error) {
      void showToast({
        style: Toast.Style.Failure,
        title: "Failed to save the parameter order",
        message: String(error),
      });
      return;
    }
    setOrder(next);
    onReordered?.();
  };

  return { templateParams, params, order, applyOrder };
}
