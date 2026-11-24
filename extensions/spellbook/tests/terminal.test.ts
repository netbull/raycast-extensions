import { runAppleScript } from "@raycast/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runInTerminal, terminalName } from "../src/lib/terminal";

describe("runInTerminal", () => {
  beforeEach(() => {
    vi.mocked(runAppleScript).mockClear();
  });

  it("hands a multi-line command with quotes and backslashes over untouched", async () => {
    const command = `echo "it's" \\\n  && printf 'a\\nb'\necho done`;

    await runInTerminal(command, "Terminal");

    const [script, args] = vi.mocked(runAppleScript).mock.calls[0];
    expect(args).toEqual([command]);
    expect(script).toContain('tell application "Terminal"');
    expect(script).toContain("item 1 of argv");
    expect(script).not.toContain("it's");
    expect(script).not.toContain("echo done");
  });

  it("targets iTerm when it is the preferred terminal", async () => {
    await runInTerminal("ssh web1", "iTerm");

    const [script, args] = vi.mocked(runAppleScript).mock.calls[0];
    expect(args).toEqual(["ssh web1"]);
    expect(script).toContain('tell application "iTerm"');
    expect(script).not.toContain("ssh web1");
  });

  it("waits without a timeout so the first-run permission prompt cannot cancel the handoff", async () => {
    await runInTerminal("ls", "Terminal");

    const [, , options] = vi.mocked(runAppleScript).mock.calls[0];
    expect(options).toEqual({ timeout: 0 });
  });
});

describe("terminalName", () => {
  it("uses the names the apps go by", () => {
    expect(terminalName("Terminal")).toBe("Terminal");
    expect(terminalName("iTerm")).toBe("iTerm2");
  });
});
