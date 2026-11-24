import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildSavedCommand,
  emptyLibrary,
  loadLibrary,
  removeCommand,
  saveLibrary,
  setParamOrder,
  upsertCommand,
} from "../src/lib/library";
import type { SavedCommand } from "../src/lib/types";

function makeCommand(overrides: Partial<SavedCommand> = {}): SavedCommand {
  return {
    id: "id-1",
    name: "List files",
    template: "ls -la {{dir=.}}",
    keywords: [],
    runMode: "inline",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("library", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spellbook-test-"));
    path = join(dir, "nested", "commands.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty library when the file does not exist", () => {
    expect(loadLibrary(path)).toEqual(emptyLibrary());
  });

  it("round-trips a library through save and load", () => {
    const library = { version: 1 as const, commands: [makeCommand()] };
    saveLibrary(path, library);
    expect(loadLibrary(path)).toEqual(library);
  });

  it("writes human-readable JSON with a trailing newline", () => {
    saveLibrary(path, emptyLibrary());
    const raw = readFileSync(path, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain("\n  \"version\": 1");
  });

  it("upserts by id", () => {
    upsertCommand(path, makeCommand());
    upsertCommand(path, makeCommand({ name: "Renamed" }));
    upsertCommand(path, makeCommand({ id: "id-2", name: "Second" }));
    const library = loadLibrary(path);
    expect(library.commands).toHaveLength(2);
    expect(library.commands[0].name).toBe("Renamed");
  });

  it("removes by id", () => {
    upsertCommand(path, makeCommand());
    upsertCommand(path, makeCommand({ id: "id-2" }));
    removeCommand(path, "id-1");
    expect(loadLibrary(path).commands.map((command) => command.id)).toEqual(["id-2"]);
  });

  it("throws on structurally invalid libraries", () => {
    saveLibrary(path, emptyLibrary());
    writeFileSync(path, JSON.stringify({ version: 2, commands: [] }), "utf8");
    expect(() => loadLibrary(path)).toThrow(/Invalid library file/);
  });

  it("rejects entries with a non-string cwd", () => {
    saveLibrary(path, emptyLibrary());
    const bad: unknown = { ...makeCommand(), cwd: 5 };
    writeFileSync(path, JSON.stringify({ version: 1, commands: [bad] }), "utf8");
    expect(() => loadLibrary(path)).toThrow(/Invalid library file/);
  });

  it("round-trips a saved parameter order", () => {
    const command = makeCommand({ template: "scp {{from}} {{to}}", paramOrder: ["to", "from"] });
    saveLibrary(path, { version: 1, commands: [command] });
    expect(loadLibrary(path).commands[0].paramOrder).toEqual(["to", "from"]);
  });

  it("rejects entries whose parameter order is not a list of names", () => {
    saveLibrary(path, emptyLibrary());
    const notAList: unknown = { ...makeCommand(), paramOrder: "to,from" };
    writeFileSync(path, JSON.stringify({ version: 1, commands: [notAList] }), "utf8");
    expect(() => loadLibrary(path)).toThrow(/Invalid library file/);

    const notNames: unknown = { ...makeCommand(), paramOrder: ["to", 2] };
    writeFileSync(path, JSON.stringify({ version: 1, commands: [notNames] }), "utf8");
    expect(() => loadLibrary(path)).toThrow(/Invalid library file/);
  });

  it("saves a new parameter order on a command and leaves the others alone", () => {
    upsertCommand(path, makeCommand({ template: "scp {{from}} {{to}}" }));
    upsertCommand(path, makeCommand({ id: "id-2", name: "Other", template: "ssh {{user}}@{{host}}" }));

    setParamOrder(path, "id-1", ["to", "from"]);

    const [first, second] = loadLibrary(path).commands;
    expect(first.paramOrder).toEqual(["to", "from"]);
    expect(first.updatedAt).not.toBe("2026-08-01T00:00:00.000Z");
    expect(first.createdAt).toBe("2026-08-01T00:00:00.000Z");
    expect(second).toEqual(makeCommand({ id: "id-2", name: "Other", template: "ssh {{user}}@{{host}}" }));
  });

  it("drops the saved order again when the parameters are put back in template order", () => {
    upsertCommand(path, makeCommand({ template: "scp {{from}} {{to}}", paramOrder: ["to", "from"] }));

    setParamOrder(path, "id-1", ["from", "to"]);

    expect(loadLibrary(path).commands[0].paramOrder).toBeUndefined();
    expect(readFileSync(path, "utf8")).not.toContain("paramOrder");
  });

  it("keeps fields it does not know about when saving a parameter order", () => {
    const withExtra: unknown = { ...makeCommand({ template: "scp {{from}} {{to}}" }), notes: "kept" };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, commands: [withExtra] }), "utf8");

    setParamOrder(path, "id-1", ["to", "from"]);

    expect(JSON.parse(readFileSync(path, "utf8")).commands[0]).toMatchObject({
      notes: "kept",
      paramOrder: ["to", "from"],
    });
  });

  it("refuses to save an order for a command that is gone", () => {
    upsertCommand(path, makeCommand());

    expect(() => setParamOrder(path, "id-missing", ["a"])).toThrow("This command is no longer in the library");
  });

  it("rejects entries missing timestamps", () => {
    saveLibrary(path, emptyLibrary());
    const { createdAt: _createdAt, ...rest } = makeCommand();
    writeFileSync(path, JSON.stringify({ version: 1, commands: [rest] }), "utf8");
    expect(() => loadLibrary(path)).toThrow(/Invalid library file/);
  });

  it("throws on malformed JSON", () => {
    saveLibrary(path, emptyLibrary());
    writeFileSync(path, "{ not json", "utf8");
    expect(() => loadLibrary(path)).toThrow();
  });
});

describe("buildSavedCommand", () => {
  const now = new Date("2026-11-24T10:00:00.000Z");
  const draft = {
    name: "  Tail logs ",
    template: " docker logs -f {{container}} ",
    keywords: [" docker", "", "logs ", "  "],
    runMode: "terminal" as const,
    cwd: " ~/work ",
  };

  it("trims the fields, drops blank keywords and stamps a new command", () => {
    const command = buildSavedCommand(draft, undefined, now);

    expect(command).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "Tail logs",
      template: "docker logs -f {{container}}",
      keywords: ["docker", "logs"],
      runMode: "terminal",
      cwd: "~/work",
      createdAt: "2026-11-24T10:00:00.000Z",
      updatedAt: "2026-11-24T10:00:00.000Z",
    });
  });

  it("gives every new command its own id", () => {
    expect(buildSavedCommand(draft).id).not.toBe(buildSavedCommand(draft).id);
  });

  it("keeps the id and creation time when updating an existing command", () => {
    const existing = makeCommand({ id: "id-9", createdAt: "2026-08-01T00:00:00.000Z" });

    const command = buildSavedCommand(draft, existing, now);

    expect(command.id).toBe("id-9");
    expect(command.createdAt).toBe("2026-08-01T00:00:00.000Z");
    expect(command.updatedAt).toBe("2026-11-24T10:00:00.000Z");
  });

  it("leaves the working directory unset when it is blank", () => {
    expect(buildSavedCommand({ ...draft, cwd: "   " }).cwd).toBeUndefined();
    expect(buildSavedCommand({ ...draft, cwd: undefined }).cwd).toBeUndefined();
  });

  it("stores a parameter order only when it differs from the template's", () => {
    const ssh = { ...draft, template: "ssh -p {{port=22}} {{user=deploy}}@{{host}}" };

    expect(buildSavedCommand({ ...ssh, paramOrder: ["host", "port", "user"] }).paramOrder).toEqual([
      "host",
      "port",
      "user",
    ]);
    expect(buildSavedCommand({ ...ssh, paramOrder: ["port", "user", "host"] }).paramOrder).toBeUndefined();
    expect(buildSavedCommand(ssh).paramOrder).toBeUndefined();
  });

  it("brings a parameter order left over from an earlier template up to date", () => {
    const edited = { ...draft, template: "ssh {{user=deploy}}@{{host}} -i {{key=~/.ssh/id}}" };

    const command = buildSavedCommand({ ...edited, paramOrder: ["host", "port", "user"] });

    expect(command.paramOrder).toEqual(["host", "user", "key"]);
  });

  it("keeps a customized order out of the saved file when it is the template's own", () => {
    const dir = mkdtempSync(join(tmpdir(), "spellbook-test-"));
    const path = join(dir, "commands.json");

    upsertCommand(path, buildSavedCommand({ ...draft, template: "scp {{from}} {{to}}", paramOrder: ["from", "to"] }));

    expect(readFileSync(path, "utf8")).not.toContain("paramOrder");
    rmSync(dir, { recursive: true, force: true });
  });

  it("produces a record the library accepts", () => {
    const dir = mkdtempSync(join(tmpdir(), "spellbook-test-"));
    const path = join(dir, "commands.json");
    const command = buildSavedCommand(draft, undefined, now);

    upsertCommand(path, command);

    expect(loadLibrary(path).commands).toEqual([command]);
    rmSync(dir, { recursive: true, force: true });
  });
});
