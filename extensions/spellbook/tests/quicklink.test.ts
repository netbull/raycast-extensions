import { describe, expect, it, vi } from "vitest";

import type { SavedCommand } from "../src/lib/types";

const command: SavedCommand = {
  id: "5b0c9f0e-2a41-4c55-9d43-0d6a3f0c7b11",
  name: "Tail docker logs",
  template: "docker logs -f {{container}}",
  keywords: [],
  runMode: "terminal",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

// the token is memoized per process, so every test starts from freshly loaded modules and empty storage
async function freshModules() {
  vi.resetModules();
  const storage = (await import("./stubs/raycast-api")).LocalStorage;
  const { createDeeplink } = await import("./stubs/raycast-utils");
  const quicklink = await import("../src/lib/quicklink");
  return { storage, createDeeplink, quicklink };
}

describe("quicklinkToken", () => {
  it("creates a token on first use and keeps returning it", async () => {
    const { quicklink } = await freshModules();

    const first = await quicklink.quicklinkToken();
    const second = await quicklink.quicklinkToken();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  it("hands concurrent first calls the same token", async () => {
    const { quicklink } = await freshModules();

    const [first, second] = await Promise.all([quicklink.quicklinkToken(), quicklink.quicklinkToken()]);

    expect(second).toBe(first);
  });

  it("reuses the token a previous launch stored", async () => {
    const { storage, quicklink } = await freshModules();
    await storage.setItem("quicklink-token", "token-from-last-launch");

    expect(await quicklink.quicklinkToken()).toBe("token-from-last-launch");
  });

  it("stores a new token so the next launch can verify links made now", async () => {
    const { storage, quicklink } = await freshModules();

    const token = await quicklink.quicklinkToken();

    expect(await storage.getItem("quicklink-token")).toBe(token);
  });
});

describe("parseQuicklinkContext", () => {
  it("accepts a command id with or without a token", async () => {
    const { quicklink } = await freshModules();

    expect(quicklink.parseQuicklinkContext({ commandId: "abc", token: "t" })).toEqual({ commandId: "abc", token: "t" });
    expect(quicklink.parseQuicklinkContext({ commandId: "abc" })).toEqual({ commandId: "abc", token: undefined });
  });

  it("drops a token that is not a string", async () => {
    const { quicklink } = await freshModules();

    expect(quicklink.parseQuicklinkContext({ commandId: "abc", token: 42 })).toEqual({
      commandId: "abc",
      token: undefined,
    });
  });

  it("ignores anything that does not name a command", async () => {
    const { quicklink } = await freshModules();

    expect(quicklink.parseQuicklinkContext(undefined)).toBeUndefined();
    expect(quicklink.parseQuicklinkContext(null)).toBeUndefined();
    expect(quicklink.parseQuicklinkContext("abc")).toBeUndefined();
    expect(quicklink.parseQuicklinkContext({})).toBeUndefined();
    expect(quicklink.parseQuicklinkContext({ commandId: "" })).toBeUndefined();
    expect(quicklink.parseQuicklinkContext({ commandId: 7 })).toBeUndefined();
  });
});

describe("buildQuicklink", () => {
  it("names the link after the command and points it at Search Commands with the id and token", async () => {
    const { quicklink } = await freshModules();

    const link = quicklink.buildQuicklink(command, "secret-token");

    expect(link.name).toBe("Tail docker logs");
    const url = new URL(link.link);
    expect(url.pathname.endsWith("/search-commands")).toBe(true);
    expect(JSON.parse(url.searchParams.get("context") ?? "null")).toEqual({
      commandId: command.id,
      token: "secret-token",
    });
  });

  it("carries only the id and token, never the command text", async () => {
    const { quicklink } = await freshModules();

    const link = quicklink.buildQuicklink(command, "secret-token");

    expect(decodeURIComponent(link.link)).not.toContain("docker");
  });

  it("builds the part every link shares only once", async () => {
    const { createDeeplink, quicklink } = await freshModules();

    quicklink.buildQuicklink(command, "secret-token");
    quicklink.buildQuicklink({ ...command, id: "another-id" }, "secret-token");

    expect(createDeeplink).toHaveBeenCalledTimes(1);
  });
});
