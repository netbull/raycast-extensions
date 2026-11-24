import { describe, expect, it } from "vitest";

import {
  commandParams,
  customOrder,
  defaultValues,
  effectiveValues,
  firstParamToFill,
  hasMalformedPlaceholder,
  moveName,
  orderParams,
  overriddenValues,
  parseTemplate,
  shellQuote,
  substitute,
} from "../src/lib/parser";

describe("parseTemplate", () => {
  it("parses required, defaulted and choice params", () => {
    const params = parseTemplate("ssh -p {{port=22}} {{user=deploy}}@{{host}} {{env=dev|staging|prod}}");
    expect(params).toEqual([
      { name: "port", defaultValue: "22" },
      { name: "user", defaultValue: "deploy" },
      { name: "host" },
      { name: "env", defaultValue: "dev", options: ["dev", "staging", "prod"] },
    ]);
  });

  it("allows spaces and equals signs inside defaults", () => {
    expect(parseTemplate("git commit -m {{msg=wip: quick fix}}")).toEqual([
      { name: "msg", defaultValue: "wip: quick fix" },
    ]);
  });

  it("dedupes repeated names and lets a later occurrence supply the default", () => {
    expect(parseTemplate("echo {{x}} {{x=5}} {{x=9}}")).toEqual([{ name: "x", defaultValue: "5" }]);
  });

  it("ignores Go-template syntax", () => {
    expect(parseTemplate('docker ps --format "{{.Names}}"')).toEqual([]);
    expect(parseTemplate("kubectl get po -o go-template='{{json .items}}'")).toEqual([]);
  });

  it("treats escaped braces as literals", () => {
    expect(parseTemplate("echo \\{{literal}}")).toEqual([]);
  });

  it("honors escaped pipes inside defaults", () => {
    expect(parseTemplate("run {{filter=a\\|b}}")).toEqual([{ name: "filter", defaultValue: "a|b" }]);
  });

  it("rejects names that do not start with a letter or underscore", () => {
    expect(parseTemplate("echo {{1bad}} {{-nope}}")).toEqual([]);
  });

  it("supports escaped closing braces inside defaults", () => {
    expect(parseTemplate('curl -d {{body={"a":1\\}}}')).toEqual([{ name: "body", defaultValue: '{"a":1}' }]);
  });

  it("supports escaped braces inside choice lists", () => {
    expect(parseTemplate("run {{x=a\\}b|c}}")).toEqual([{ name: "x", defaultValue: "a}b", options: ["a}b", "c"] }]);
  });

  it("keeps an escaped literal {{ inside a default intact", () => {
    expect(parseTemplate("echo {{greeting=hi \\{{there}}")).toEqual([{ name: "greeting", defaultValue: "hi {{there" }]);
  });
});

describe("hasMalformedPlaceholder", () => {
  it("flags unclosed placeholders and unescaped braces in defaults", () => {
    expect(hasMalformedPlaceholder("echo {{oops")).toBe(true);
    expect(hasMalformedPlaceholder("echo {{a=}b}}")).toBe(true);
  });

  it("accepts valid templates, escapes, and Go-template text", () => {
    expect(hasMalformedPlaceholder("echo {{x=1}}")).toBe(false);
    expect(hasMalformedPlaceholder("echo \\{{end}}")).toBe(false);
    expect(hasMalformedPlaceholder('docker ps --format "{{.Names}}"')).toBe(false);
    expect(hasMalformedPlaceholder("kubectl get po -o go-template='{{json .items}}'")).toBe(false);
  });
});

describe("shellQuote", () => {
  it("leaves safe values untouched", () => {
    expect(shellQuote("25")).toBe("25");
    expect(shellQuote("release/2.4")).toBe("release/2.4");
    expect(shellQuote("HEAD~3")).toBe("HEAD~3");
  });

  it("quotes values with spaces or shell metacharacters", () => {
    expect(shellQuote("a; rm x")).toBe("'a; rm x'");
    expect(shellQuote("$(whoami)")).toBe("'$(whoami)'");
    expect(shellQuote("`id`")).toBe("'`id`'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("quotes the empty string", () => {
    expect(shellQuote("")).toBe("''");
  });

  it("quotes words zsh would expand despite the safe charset", () => {
    expect(shellQuote("=error")).toBe("'=error'");
    expect(shellQuote("~root/x")).toBe("'~root/x'");
  });

  it("keeps tilde paths bare so the shell expands them", () => {
    expect(shellQuote("~")).toBe("~");
    expect(shellQuote("~/notes.txt")).toBe("~/notes.txt");
  });
});

describe("substitute", () => {
  it("applies defaults when no values are given", () => {
    const result = substitute("git rebase -i HEAD~{{count=3}}", {});
    expect(result).toEqual({ command: "git rebase -i HEAD~3", missing: [] });
  });

  it("prefers provided values over defaults", () => {
    const result = substitute("git log -n {{count=20}} {{branch=main}}", { branch: "develop" });
    expect(result.command).toBe("git log -n 20 develop");
  });

  it("reports missing required params and keeps the placeholder", () => {
    const result = substitute("ssh {{user=deploy}}@{{host}}", {});
    expect(result.missing).toEqual(["host"]);
    expect(result.command).toBe("ssh deploy@{{host}}");
  });

  it("falls back to the default when a value is empty", () => {
    const result = substitute("echo {{x=5}}", { x: "" });
    expect(result.command).toBe("echo 5");
  });

  it("quotes unsafe values", () => {
    const result = substitute("echo {{msg}}", { msg: "hello world; rm -rf /" });
    expect(result.command).toBe("echo 'hello world; rm -rf /'");
  });

  it("substitutes every occurrence of a repeated name", () => {
    const result = substitute("cp {{f}} {{f}}.bak", { f: "notes.txt" });
    expect(result.command).toBe("cp notes.txt notes.txt.bak");
  });

  it("restores escaped braces without treating them as params", () => {
    const result = substitute("echo \\{{x}} {{y=2}}", {});
    expect(result).toEqual({ command: "echo {{x}} 2", missing: [] });
  });

  it("leaves Go-template braces untouched", () => {
    const template = 'docker ps --format "{{.Names}}" {{opt=--all}}';
    expect(substitute(template, {}).command).toBe('docker ps --format "{{.Names}}" --all');
  });

  it("substitutes defaults containing escaped braces", () => {
    expect(substitute('curl -d {{body={"a":1\\}}}', {}).command).toBe(`curl -d '{"a":1}'`);
  });

  it("substitutes defaults containing an escaped literal brace pair", () => {
    expect(substitute("echo {{greeting=hi \\{{there}}", {}).command).toBe("echo 'hi {{there'");
  });
});

describe("defaultValues", () => {
  it("collects only params that have defaults", () => {
    const params = parseTemplate("ssh -p {{port=22}} {{host}}");
    expect(defaultValues(params)).toEqual({ port: "22" });
  });
});

describe("effectiveValues", () => {
  const params = parseTemplate("ssh -p {{port=22}} {{host}} {{env=dev|staging|prod}}");

  it("prefers last-used values over defaults and fills required params", () => {
    expect(effectiveValues(params, { port: "2222", host: "web1" })).toEqual({
      port: "2222",
      host: "web1",
      env: "dev",
    });
  });

  it("falls back to defaults without history", () => {
    expect(effectiveValues(params, undefined)).toEqual({ port: "22", env: "dev" });
  });

  it("ignores empty values and stale choices", () => {
    expect(effectiveValues(params, { port: "", env: "gone" })).toEqual({ port: "22", env: "dev" });
  });

  it("ignores last values for params no longer in the template", () => {
    expect(effectiveValues(params, { removed: "x" })).toEqual({ port: "22", env: "dev" });
  });
});

describe("overriddenValues", () => {
  const params = parseTemplate("ssh -p {{port=22}} {{host}} {{env=dev|staging|prod}}");

  it("keeps only the values that differ from the template's defaults", () => {
    expect(overriddenValues(params, { port: "22", host: "web1", env: "prod" })).toEqual({
      host: "web1",
      env: "prod",
    });
  });

  it("drops empty values", () => {
    expect(overriddenValues(params, { port: "", host: "" })).toEqual({});
  });

  it("keeps nothing when every value is just the default", () => {
    expect(overriddenValues(params, defaultValues(params))).toEqual({});
  });
});

describe("orderParams", () => {
  const params = parseTemplate("ssh -p {{port=22}} {{user=deploy}}@{{host}}");
  const names = (ordered: typeof params) => ordered.map((param) => param.name);

  it("keeps the template order when no order is saved", () => {
    expect(names(orderParams(params))).toEqual(["port", "user", "host"]);
    expect(names(orderParams(params, []))).toEqual(["port", "user", "host"]);
  });

  it("puts the parameters in the saved order", () => {
    expect(names(orderParams(params, ["host", "user", "port"]))).toEqual(["host", "user", "port"]);
  });

  it("keeps parameters the order does not mention in template order after the ones it does", () => {
    expect(names(orderParams(params, ["host"]))).toEqual(["host", "port", "user"]);
  });

  it("ignores names that are no longer in the template and repeated names", () => {
    expect(names(orderParams(params, ["gone", "host", "host", "port"]))).toEqual(["host", "port", "user"]);
  });

  it("keeps each parameter's default and choices", () => {
    const [first] = orderParams(parseTemplate("run {{a=1}} {{env=dev|prod}}"), ["env", "a"]);

    expect(first).toEqual({ name: "env", defaultValue: "dev", options: ["dev", "prod"] });
  });
});

describe("commandParams", () => {
  it("returns a command's parameters in its saved order", () => {
    const command = { template: "scp {{from}} {{to}}", paramOrder: ["to", "from"] };

    expect(commandParams(command).map((param) => param.name)).toEqual(["to", "from"]);
  });

  it("falls back to the template order for a command without one", () => {
    expect(commandParams({ template: "scp {{from}} {{to}}" }).map((param) => param.name)).toEqual(["from", "to"]);
  });
});

describe("customOrder", () => {
  const template = "ssh -p {{port=22}} {{user=deploy}}@{{host}}";

  it("records an order that differs from the template's", () => {
    expect(customOrder(template, ["host", "port", "user"])).toEqual(["host", "port", "user"]);
  });

  it("records nothing when the order is just the template's own", () => {
    expect(customOrder(template, ["port", "user", "host"])).toBeUndefined();
    expect(customOrder(template, [])).toBeUndefined();
    expect(customOrder(template, undefined)).toBeUndefined();
  });

  it("completes a partial order and drops names the template no longer has", () => {
    expect(customOrder(template, ["gone", "host"])).toEqual(["host", "port", "user"]);
  });

  it("records nothing for a command without parameters", () => {
    expect(customOrder("uptime", ["host"])).toBeUndefined();
  });
});

describe("firstParamToFill", () => {
  const template = "ssh -p {{port=22}} {{user}}@{{host}}";
  const params = parseTemplate(template);

  it("picks the first parameter that still has no value", () => {
    expect(firstParamToFill(params, effectiveValues(params))).toBe("user");
    expect(firstParamToFill(params, effectiveValues(params, { user: "deploy" }))).toBe("host");
  });

  it("follows the saved order rather than the template's", () => {
    const reordered = commandParams({ template, paramOrder: ["host", "user", "port"] });

    expect(firstParamToFill(reordered, effectiveValues(reordered))).toBe("host");
  });

  it("falls back to the first required parameter once every one has a value", () => {
    const values = effectiveValues(params, { user: "deploy", host: "web1" });

    expect(firstParamToFill(params, values)).toBe("user");
  });

  it("falls back to the first parameter when none is required", () => {
    const optional = parseTemplate("ls {{flags=-la}} {{dir=.}}");

    expect(firstParamToFill(optional, effectiveValues(optional))).toBe("flags");
  });

  it("does not treat an empty default as missing", () => {
    const withEmptyDefault = parseTemplate("grep {{flags=}} {{pattern}}");

    expect(firstParamToFill(withEmptyDefault, effectiveValues(withEmptyDefault))).toBe("pattern");
  });

  it("has nothing to focus for a command without parameters", () => {
    expect(firstParamToFill([], {})).toBeUndefined();
  });
});

describe("moveName", () => {
  const names = ["port", "user", "host"];

  it("moves a name one place up or down", () => {
    expect(moveName(names, "host", -1)).toEqual(["port", "host", "user"]);
    expect(moveName(names, "port", 1)).toEqual(["user", "port", "host"]);
  });

  it("leaves the list alone at either end and for an unknown name", () => {
    expect(moveName(names, "port", -1)).toBe(names);
    expect(moveName(names, "host", 1)).toBe(names);
    expect(moveName(names, "gone", 1)).toBe(names);
  });

  it("does not change the list it was given", () => {
    moveName(names, "host", -1);

    expect(names).toEqual(["port", "user", "host"]);
  });
});
