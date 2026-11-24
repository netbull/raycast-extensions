import { useEffect, useRef } from "react";

import { Form } from "@raycast/api";

import type { ParamDef } from "../lib/parser";

interface ParamFieldProps {
  param: ParamDef;
  value: string;
  autoFocus: boolean;
  focusToken?: number;
  onChange: (name: string, value: string) => void;
  onFocus: (name: string) => void;
}

export default function ParamField(props: ParamFieldProps) {
  const { param, value, autoFocus, focusToken, onChange, onFocus } = props;

  const itemRef = useRef<Form.ItemReference>(null);

  // a field that just changed places asks for the focus back, since moving it can drop it
  useEffect(() => {
    if (focusToken !== undefined) {
      itemRef.current?.focus();
    }
  }, [focusToken]);

  if (param.options) {
    return (
      <Form.Dropdown
        ref={itemRef}
        id={param.name}
        title={param.name}
        value={value}
        onChange={(next) => onChange(param.name, next)}
        onFocus={() => onFocus(param.name)}
        autoFocus={autoFocus}
      >
        {param.options.map((option) => (
          <Form.Dropdown.Item key={option} value={option} title={option} />
        ))}
      </Form.Dropdown>
    );
  }

  return (
    <Form.TextField
      ref={itemRef}
      id={param.name}
      title={param.name}
      placeholder={param.defaultValue ?? "required"}
      value={value}
      onChange={(next) => onChange(param.name, next)}
      onFocus={() => onFocus(param.name)}
      autoFocus={autoFocus}
    />
  );
}
