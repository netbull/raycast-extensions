import { randomUUID } from "node:crypto";

import { LocalStorage } from "@raycast/api";
import { createDeeplink } from "@raycast/utils";

import type { SavedCommand } from "./types";

const TOKEN_KEY = "quicklink-token";
const TARGET_COMMAND = "search-commands";

export interface QuicklinkContext {
  commandId: string;
  token?: string;
}

export interface CommandQuicklink {
  name: string;
  link: string;
}

let pendingToken: Promise<string> | undefined;
let linkBase: string | undefined;

async function loadOrCreateToken(): Promise<string> {
  const stored = await LocalStorage.getItem<string>(TOKEN_KEY);
  if (typeof stored === "string" && stored !== "") {
    return stored;
  }
  const token = randomUUID();
  await LocalStorage.setItem(TOKEN_KEY, token);
  return token;
}

// the token lives only in this Raycast's local storage, never in the library file, so a link that carries it was created here and not crafted from a shared library
export function quicklinkToken(): Promise<string> {
  pendingToken ??= loadOrCreateToken().catch((error: unknown) => {
    pendingToken = undefined;
    throw error;
  });
  return pendingToken;
}

// launch context arrives through a URL anyone can craft, so it is validated like any other untrusted input
export function parseQuicklinkContext(
  context: unknown,
): QuicklinkContext | undefined {
  if (typeof context !== "object" || context === null) {
    return undefined;
  }
  const { commandId, token } = context as Record<string, unknown>;
  if (typeof commandId !== "string" || commandId === "") {
    return undefined;
  }
  return { commandId, token: typeof token === "string" ? token : undefined };
}

export function buildQuicklink(
  command: SavedCommand,
  token: string,
): CommandQuicklink {
  // createDeeplink re-reads the manifest on every call, so the part every row shares is built once
  linkBase ??= createDeeplink({ command: TARGET_COMMAND });
  // only the id travels in the link — never the command text or any parameter values
  const context: QuicklinkContext = { commandId: command.id, token };
  return {
    name: command.name,
    link: `${linkBase}?context=${encodeURIComponent(JSON.stringify(context))}`,
  };
}
