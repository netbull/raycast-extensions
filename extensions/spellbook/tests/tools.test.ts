import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runAppleScript } from "@raycast/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadLibrary, saveLibrary } from "../src/lib/library";
import createCommand, { confirmation as confirmCreate } from "../src/tools/create-command";
import getCommands from "../src/tools/get-commands";
import runCommand, { confirmation as confirmRun } from "../src/tools/run-command";
import type { SavedCommand } from "../src/lib/types";
import { resetRaycastStub } from "./stubs/raycast-api";

vi.mock("../src/lib/shellEnv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/shellEnv")>()),
  // capturing the real login-shell environment is slow and differs per machine
  captureShellEnv: async () => process.env,
}));

function makeCommand(overrides: Partial<SavedCommand> = {}): SavedCommand {
  return {
    id: "id-join",
    name: "Join words",
    template: "printf '%s-%s' {{first=a}} {{second}}",
    keywords: ["demo"],
    runMode: "inline",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AI tools", () => {
  let dir: string;
  let libraryPath: string;

  function seed(...commands: SavedCommand[]): void {
    saveLibrary(libraryPath, { version: 1, commands });
  }

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "spellbook-tools-")));
    libraryPath = join(dir, "commands.json");
    resetRaycastStub({ libraryPath, terminalApp: "Terminal" });
    vi.mocked(runAppleScript).mockClear();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("get-commands", () => {
    it("lists the library with each command's parameters", () => {
      seed(makeCommand(), makeCommand({ id: "id-up", name: "Uptime", template: "uptime", keywords: [] }));

      const result = getCommands({});

      expect(result.total).toBe(2);
      expect(result.matched).toBe(2);
      expect(result.commands.map((command) => command.id)).toEqual(["id-join", "id-up"]);
      expect(result.commands[0].parameters).toEqual([
        { name: "first", required: false, default: "a" },
        { name: "second", required: true },
      ]);
    });

    it("narrows the list to a query while still reporting the library size", () => {
      seed(makeCommand(), makeCommand({ id: "id-up", name: "Uptime", template: "uptime", keywords: [] }));

      const result = getCommands({ query: "uptime" });

      expect(result.total).toBe(2);
      expect(result.matched).toBe(1);
      expect(result.commands.map((command) => command.name)).toEqual(["Uptime"]);
    });

    it("returns an empty list for a library that does not exist yet", () => {
      expect(getCommands({})).toEqual({ total: 0, matched: 0, commands: [] });
    });
  });

  describe("run-command", () => {
    it("runs an inline command with the given values and returns its output", async () => {
      seed(makeCommand({ cwd: dir }));

      const result = await runCommand({ id: "id-join", parameters: [{ name: "second", value: "b c" }] });

      expect(result).toMatchObject({
        name: "Join words",
        command: "printf '%s-%s' a 'b c'",
        directory: dir,
        exitCode: 0,
        output: "a-b c",
        truncated: false,
        timedOut: false,
      });
    });

    it("returns a failing command's exit code and error output instead of throwing", async () => {
      seed(makeCommand({ template: "echo broken >&2; exit 4", cwd: dir }));

      const result = await runCommand({ id: "id-join" });

      expect(result).toMatchObject({ exitCode: 4, output: "broken\n" });
    });

    it("hands a terminal command to the terminal and says its output is elsewhere", async () => {
      seed(makeCommand({ template: "ssh {{host}}", runMode: "terminal", cwd: dir }));

      const result = await runCommand({ id: "id-join", parameters: [{ name: "host", value: "web1" }] });

      expect(vi.mocked(runAppleScript).mock.calls[0][1]).toEqual([`cd ${dir} && ssh web1`]);
      expect(result).toEqual({
        name: "Join words",
        command: "ssh web1",
        note: "Handed off to Terminal. Its output is not available here.",
      });
    });

    it("refuses an id that is not in the library and points to get-commands", async () => {
      seed(makeCommand());

      await expect(runCommand({ id: "id-missing" })).rejects.toThrow(
        'No saved command has the id "id-missing". Call get-commands to look up the right id.',
      );
    });

    it("refuses to run while a required parameter is missing", async () => {
      seed(makeCommand());

      await expect(runCommand({ id: "id-join" })).rejects.toThrow("Missing required parameter: second.");
    });

    it("treats a parameter that arrives without a value as not provided", async () => {
      seed(makeCommand());
      const input: Parameters<typeof runCommand>[0] = JSON.parse(
        '{"id":"id-join","parameters":[{"name":"second"},{"name":"first","value":null}]}',
      );

      await expect(runCommand(input)).rejects.toThrow("Missing required parameter: second.");
    });

    it("accepts values a model sent as numbers and ignores parameters that are not a list", async () => {
      seed(makeCommand({ cwd: dir }));
      const numeric: Parameters<typeof runCommand>[0] = JSON.parse(
        '{"id":"id-join","parameters":[{"name":"second","value":42}]}',
      );
      const malformed: Parameters<typeof runCommand>[0] = JSON.parse('{"id":"id-join","parameters":"second=b"}');

      expect(await runCommand(numeric)).toMatchObject({ command: "printf '%s-%s' a 42", output: "a-42" });
      await expect(runCommand(malformed)).rejects.toThrow("Missing required parameter: second.");
    });

    it("refuses to run in a working directory that does not exist", async () => {
      seed(makeCommand({ template: "pwd", cwd: join(dir, "gone") }));

      await expect(runCommand({ id: "id-join" })).rejects.toThrow(
        `The working directory does not exist: ${join(dir, "gone")}`,
      );
    });

    it("asks for confirmation with the exact command that would run", async () => {
      seed(makeCommand({ cwd: dir }));

      const confirmation = await confirmRun({ id: "id-join", parameters: [{ name: "second", value: "b c" }] });

      expect(confirmation).toEqual({
        style: "regular",
        message: "Run this command?",
        info: [
          { name: "Command", value: "printf '%s-%s' a 'b c'" },
          { name: "Saved As", value: "Join words" },
          { name: "Directory", value: dir },
          { name: "Runs In", value: "Raycast" },
        ],
      });
    });

    it("marks the confirmation destructive and names the danger for a risky command", async () => {
      seed(makeCommand({ template: "rm -rf {{target}}", runMode: "terminal" }));

      const confirmation = await confirmRun({ id: "id-join", parameters: [{ name: "target", value: "./build" }] });

      expect(confirmation?.style).toBe("destructive");
      expect(confirmation?.message).toBe("Run this command? Detected: recursive or forced rm.");
      expect(confirmation?.info).toContainEqual({ name: "Command", value: "rm -rf ./build" });
      expect(confirmation?.info).toContainEqual({ name: "Runs In", value: "Terminal" });
    });

    it("skips the confirmation when the input cannot run, leaving the error to the tool", async () => {
      seed(makeCommand());

      expect(await confirmRun({ id: "id-missing" })).toBeUndefined();
      expect(await confirmRun({ id: "id-join" })).toBeUndefined();
    });
  });

  describe("create-command", () => {
    it("saves a trimmed command to the library file and describes it", () => {
      const result = createCommand({
        name: "  List Pods ",
        template: " kubectl get pods -n {{namespace=staging|prod}} ",
        keywords: ["k8s", " "],
        runMode: "terminal",
        workingDirectory: "~/work",
      });

      const [saved] = loadLibrary(libraryPath).commands;
      expect(saved).toMatchObject({
        name: "List Pods",
        template: "kubectl get pods -n {{namespace=staging|prod}}",
        keywords: ["k8s"],
        runMode: "terminal",
        cwd: "~/work",
      });
      expect(result).toMatchObject({
        id: saved.id,
        name: "List Pods",
        parameters: [{ name: "namespace", required: false, default: "staging", choices: ["staging", "prod"] }],
      });
    });

    it("defaults to the inline run mode and the home directory", () => {
      createCommand({ name: "Uptime", template: "uptime" });

      const [saved] = loadLibrary(libraryPath).commands;
      expect(saved.runMode).toBe("inline");
      expect(saved.cwd).toBeUndefined();
      expect(saved.keywords).toEqual([]);
    });

    it("keeps the commands that are already in the library", () => {
      seed(makeCommand());

      createCommand({ name: "Uptime", template: "uptime" });

      expect(loadLibrary(libraryPath).commands.map((command) => command.name)).toEqual(["Join words", "Uptime"]);
    });

    it("refuses a name that is already taken, whatever its case", () => {
      seed(makeCommand());

      expect(() => createCommand({ name: "join WORDS", template: "echo hi" })).toThrow(
        'A command named "join WORDS" already exists. Choose a different name.',
      );
      expect(loadLibrary(libraryPath).commands).toHaveLength(1);
    });

    it("refuses a blank name or template", () => {
      expect(() => createCommand({ name: "  ", template: "uptime" })).toThrow(
        "A saved command needs both a name and a template.",
      );
      expect(() => createCommand({ name: "Uptime", template: "" })).toThrow(
        "A saved command needs both a name and a template.",
      );
    });

    it("refuses a template with a malformed placeholder", () => {
      expect(() => createCommand({ name: "Broken", template: "echo {{name=unclosed" })).toThrow(
        /malformed \{\{…\}\} placeholder/,
      );
      expect(loadLibrary(libraryPath).commands).toHaveLength(0);
    });

    it("asks for confirmation with the parameters it detected", async () => {
      const confirmation = await confirmCreate({
        name: "SSH",
        template: "ssh -p {{port=22}} {{user=deploy|root}}@{{host}}",
        runMode: "terminal",
      });

      expect(confirmation).toEqual({
        message: "Save this command to Spellbook?",
        info: [
          { name: "Name", value: "SSH" },
          { name: "Command", value: "ssh -p {{port=22}} {{user=deploy|root}}@{{host}}" },
          { name: "Parameters", value: "port (default 22), user (deploy | root), host (required)" },
          { name: "Runs In", value: "Terminal" },
          { name: "Directory", value: undefined },
        ],
      });
    });

    it("skips the confirmation when nothing would be saved", async () => {
      expect(await confirmCreate({ name: "", template: "uptime" })).toBeUndefined();
    });
  });
});
