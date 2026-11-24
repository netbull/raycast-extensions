// Stand-ins for the @raycast/utils helpers the non-UI code calls; the real ones need Raycast and osascript.

import { vi } from "vitest";

type RunAppleScript = (
  script: string,
  args?: string[],
  options?: object,
) => Promise<string>;

type CreateDeeplink = (options: { command: string }) => string;

export const runAppleScript = vi.fn<RunAppleScript>(async () => "");

export const createDeeplink = vi.fn<CreateDeeplink>(
  (options) => `raycast://extensions/test/spellbook/${options.command}`,
);
