import { describe, expect, it } from "vitest";

import { describeCommand, rankCommands } from "../src/lib/describe";
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

describe("describeCommand", () => {
  it("spells out each parameter's default, choices and whether it is required", () => {
    const command = makeCommand({
      id: "id-7",
      name: "SSH",
      template: "ssh -p {{port=22}} {{user=deploy|root}}@{{host}}",
      keywords: ["remote"],
      runMode: "terminal",
      cwd: "~/work",
    });

    expect(describeCommand(command)).toEqual({
      id: "id-7",
      name: "SSH",
      template: "ssh -p {{port=22}} {{user=deploy|root}}@{{host}}",
      parameters: [
        { name: "port", required: false, default: "22" },
        { name: "user", required: false, default: "deploy", choices: ["deploy", "root"] },
        { name: "host", required: true },
      ],
      keywords: ["remote"],
      runMode: "terminal",
      workingDirectory: "~/work",
    });
  });

  it("lists the parameters in the command's saved order", () => {
    const command = makeCommand({ template: "scp {{from}} {{to=~/Downloads}}", paramOrder: ["to", "from"] });

    expect(describeCommand(command).parameters).toEqual([
      { name: "to", required: false, default: "~/Downloads" },
      { name: "from", required: true },
    ]);
  });

  it("reports no parameters for a plain command", () => {
    expect(describeCommand(makeCommand({ template: "uptime" })).parameters).toEqual([]);
  });
});

describe("rankCommands", () => {
  const logs = makeCommand({ id: "logs", name: "Tail docker logs", template: "docker logs -f {{container}}" });
  const shell = makeCommand({ id: "shell", name: "Container shell", template: "docker exec -it {{container}} sh" });
  const git = makeCommand({ id: "git", name: "Git graph", template: "git log --graph", keywords: ["history"] });
  const commands = [git, shell, logs];

  it("returns everything in library order for an empty query", () => {
    expect(rankCommands(commands, "")).toEqual(commands);
    expect(rankCommands(commands, "   ")).toEqual(commands);
  });

  it("matches names, keywords and templates without regard to case", () => {
    expect(rankCommands(commands, "GRAPH")).toEqual([git]);
    expect(rankCommands(commands, "history")).toEqual([git]);
    expect(rankCommands(commands, "exec")).toEqual([shell]);
  });

  it("keeps commands that match any term and puts the best match first", () => {
    const ranked = rankCommands(commands, "show me the docker logs please");

    expect(ranked).toEqual([logs, shell]);
  });

  it("ranks a match in the name above a match in the template", () => {
    expect(rankCommands(commands, "container")).toEqual([shell, logs]);
  });

  it("keeps library order between equally good matches", () => {
    const pods = makeCommand({ id: "pods", name: "Pods", template: "kubectl get pods" });
    const nodes = makeCommand({ id: "nodes", name: "Nodes", template: "kubectl get nodes" });

    expect(rankCommands([pods, nodes], "kubectl")).toEqual([pods, nodes]);
    expect(rankCommands([nodes, pods], "kubectl")).toEqual([nodes, pods]);
  });

  it("returns nothing when no term matches", () => {
    expect(rankCommands(commands, "kubernetes")).toEqual([]);
  });
});
