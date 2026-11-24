import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { planRun, resolveInvocation } from "../src/lib/run";
import type { SavedCommand } from "../src/lib/types";

function makeCommand(overrides: Partial<SavedCommand> = {}): SavedCommand {
  return {
    id: "id-1",
    name: "Tail logs",
    template: "docker logs --tail {{lines=100}} {{container=api|worker|db}} {{host}}",
    keywords: [],
    runMode: "inline",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("planRun", () => {
  it("runs in the home directory when no working directory is set", () => {
    const plan = planRun(makeCommand(), "ls -la");

    expect(plan.cwd).toBe(homedir());
    expect(plan.terminalCommand).toBe("ls -la");
  });

  it("treats an empty working directory as unset", () => {
    const plan = planRun(makeCommand({ cwd: "" }), "ls -la");

    expect(plan.cwd).toBe(homedir());
    expect(plan.terminalCommand).toBe("ls -la");
  });

  it("expands the working directory and makes a terminal session cd into it", () => {
    const expected = join(homedir(), "my projects");

    const plan = planRun(makeCommand({ cwd: "~/my projects" }), "ls -la");

    expect(plan.cwd).toBe(expected);
    expect(plan.terminalCommand).toBe(`cd '${expected}' && ls -la`);
  });

  it("flags a dangerous resolved command and leaves ordinary ones alone", () => {
    expect(planRun(makeCommand(), "rm -rf ./build").danger).toEqual({ label: "recursive or forced rm" });
    expect(planRun(makeCommand(), "ls -la").danger).toBeUndefined();
  });
});

describe("resolveInvocation", () => {
  it("fills parameters that were left out with their defaults", () => {
    const resolved = resolveInvocation(makeCommand(), [{ name: "host", value: "web1" }]);

    expect(resolved).toBe("docker logs --tail 100 api web1");
  });

  it("applies every provided value", () => {
    const resolved = resolveInvocation(makeCommand(), [
      { name: "lines", value: "500" },
      { name: "container", value: "worker" },
      { name: "host", value: "web2" },
    ]);

    expect(resolved).toBe("docker logs --tail 500 worker web2");
  });

  it("shell-quotes a value so it cannot break out of its argument", () => {
    const resolved = resolveInvocation(makeCommand(), [{ name: "host", value: "web1; rm -rf ~" }]);

    expect(resolved).toBe("docker logs --tail 100 api 'web1; rm -rf ~'");
  });

  it("treats an empty value as not provided", () => {
    const resolved = resolveInvocation(makeCommand(), [
      { name: "lines", value: "" },
      { name: "host", value: "web1" },
    ]);

    expect(resolved).toBe("docker logs --tail 100 api web1");
  });

  it("rejects a parameter the template does not have and lists the real ones", () => {
    expect(() => resolveInvocation(makeCommand(), [{ name: "hots", value: "web1" }])).toThrow(
      '"Tail logs" has no parameter "hots". Its parameters are: lines, container, host.',
    );
  });

  it("rejects a value that is not in the choice list", () => {
    expect(() =>
      resolveInvocation(makeCommand(), [
        { name: "container", value: "cache" },
        { name: "host", value: "web1" },
      ]),
    ).toThrow('"cache" is not a valid value for "container". Choose one of: api, worker, db.');
  });

  it("reports the required parameters that are still missing", () => {
    expect(() => resolveInvocation(makeCommand())).toThrow("Missing required parameter: host.");
    expect(() => resolveInvocation(makeCommand({ template: "scp {{from}} {{to}}" }))).toThrow(
      "Missing required parameters: from, to.",
    );
  });

  it("names parameters in the command's saved order", () => {
    const command = makeCommand({ name: "Copy", template: "scp {{from}} {{to}}", paramOrder: ["to", "from"] });

    expect(() => resolveInvocation(command)).toThrow("Missing required parameters: to, from.");
    expect(() => resolveInvocation(command, [{ name: "via", value: "x" }])).toThrow(
      '"Copy" has no parameter "via". Its parameters are: to, from.',
    );
  });

  it("substitutes by name whatever order the parameters are saved in", () => {
    const command = makeCommand({ template: "scp {{from}} {{to}}", paramOrder: ["to", "from"] });

    const resolved = resolveInvocation(command, [
      { name: "to", value: "b.txt" },
      { name: "from", value: "a.txt" },
    ]);

    expect(resolved).toBe("scp a.txt b.txt");
  });

  it("says so when a command without parameters is given one", () => {
    const command = makeCommand({ name: "Uptime", template: "uptime" });

    expect(() => resolveInvocation(command, [{ name: "host", value: "web1" }])).toThrow(
      '"Uptime" takes no parameters.',
    );
    expect(resolveInvocation(command)).toBe("uptime");
  });
});
