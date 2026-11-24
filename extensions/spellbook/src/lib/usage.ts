import { LocalStorage } from "@raycast/api";

import { overriddenValues, parseTemplate } from "./parser";
import type { SavedCommand } from "./types";

export type LastAction = "run" | "copy" | "paste";

export interface CommandUsage {
  action: LastAction;
  values: Record<string, string>;
  usedAt: string;
}

export type UsageState = Record<string, CommandUsage>;

const PREFIX = "usage:";

function isCommandUsage(value: unknown): value is CommandUsage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const usage = value as Record<string, unknown>;
  return (
    (usage.action === "run" ||
      usage.action === "copy" ||
      usage.action === "paste") &&
    typeof usage.usedAt === "string" &&
    typeof usage.values === "object" &&
    usage.values !== null &&
    Object.values(usage.values).every((entry) => typeof entry === "string")
  );
}

function parseUsage(raw: unknown): CommandUsage | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isCommandUsage(parsed) ? parsed : undefined;
  } catch {
    // corrupted entry — ignore
    return undefined;
  }
}

export function usageEntry(
  command: SavedCommand,
  action: LastAction,
  values: Record<string, string>,
): CommandUsage {
  return {
    action,
    values: overriddenValues(parseTemplate(command.template), values),
    usedAt: new Date().toISOString(),
  };
}

export async function readUsageState(): Promise<UsageState> {
  const items = await LocalStorage.allItems();
  const state: UsageState = {};
  for (const [key, raw] of Object.entries(items)) {
    if (!key.startsWith(PREFIX)) {
      continue;
    }
    const usage = parseUsage(raw);
    if (usage) {
      state[key.slice(PREFIX.length)] = usage;
    }
  }
  return state;
}

export async function readUsage(
  commandId: string,
): Promise<CommandUsage | undefined> {
  return parseUsage(await LocalStorage.getItem(`${PREFIX}${commandId}`));
}

export async function saveUsage(
  commandId: string,
  usage: CommandUsage,
): Promise<void> {
  await LocalStorage.setItem(`${PREFIX}${commandId}`, JSON.stringify(usage));
}

export async function removeUsage(commandId: string): Promise<void> {
  await LocalStorage.removeItem(`${PREFIX}${commandId}`);
}
