# Spellbook

Your parameterized shell command library for Raycast. Save the commands you keep re-typing as templates whose parameters carry **default values**, find them instantly, and run, copy or paste them as-is — or override any parameter right before execution. Raycast AI can fill in the parameters for you.

## Why

Shell history is where commands go to be lost. Quicklinks can't execute shell. Snippets only paste text and stop at three arguments. Script Commands need a script file per command, also stop at three arguments, and have no argument defaults. Spellbook gives you: save once → find in 2–4 keystrokes → Enter to repeat it with the values you used last → or one more keystroke to tweak a parameter.

## Placeholder syntax

Parameters live inline in the command string, as many as you need:

| Syntax | Meaning |
| --- | --- |
| `{{name}}` | Required — running always prompts for it |
| `{{name=default}}` | Optional with a default (spaces and `=` allowed in the default) |
| `{{name=a\|b\|c}}` | Choice list rendered as a dropdown; the first option is the default |
| `\{{` | Literal `{{` (for the rare Go-template collision like `{{end}}`) |
| `\}` / `\|` | Literal `}` or `\|` inside a default (e.g. `{{body={"a":1\}}}`) |

Go-template syntax such as `docker ps --format "{{.Names}}"` passes through untouched — placeholder names must start with a letter or underscore.

Examples:

```
git log --graph --oneline -n {{count=25}} {{branch=main}}
ssh -p {{port=22}} {{user=deploy}}@{{host}}
docker logs -f --tail {{lines=100}} {{container=api|worker|db}}
```

Substituted values are shell-quoted automatically when they contain anything beyond safe characters (words starting with `=` or `~user` are quoted too, since zsh would expand them). Values starting with `~/` are deliberately left bare so the shell still expands them to your home directory. The override form always shows the exact final command before you run it, and a repeated `{{name}}` shares one value across all occurrences.

## Usage

- **Search Commands** — the hub. Each command remembers its **last-used parameter values and last-used action**, so Enter repeats exactly what you did last time: if you last ran it, Enter runs it again with the same values; if you last copied it, Enter copies it again. The list subtitle always shows the exact command Enter will produce. Cmd+Enter opens the override form prefilled with the last-used values (defaults fill anything untouched); a "Run with Default Values" action ignores the memory when you need the pristine template. If a required parameter has never been filled, Enter opens the form focused on it. Cmd+D toggles a preview pane with the resolved command and a parameter table (including last-used values). Cmd+Shift+C copies the resolved command, Cmd+Shift+V pastes it into the frontmost app, Cmd+E edits, Cmd+N creates, Ctrl+X deletes.
- **Save Command** — capture a new command. The template is prefilled from your clipboard when it looks like shell. Parameters are detected live as you type.

### Parameter order

Parameters are asked for in the order they first appear in the command. To put the ones you change most at the top, open the form with Cmd+Enter, put the cursor in a field and press Cmd+Opt+↑ or Cmd+Opt+↓ to move it. The new order is saved with the command straight away. **Reorder Parameters** (Cmd+Shift+R) shows the whole order as a list and can reset it; it is also available while saving or editing a command.

### Run from Root Search with Quicklinks

**Create Quicklink** in a command's Action Panel turns it into a Raycast Quicklink, so you can run it straight from Root Search and give it an alias or a hotkey like any other Quicklink. It runs with the values you used last (defaults for the rest), opens the form when a required parameter has no value yet, and still asks before a dangerous command. The Quicklink points at the saved command rather than copying its text, so later edits apply to it automatically.

A Quicklink runs on its own only in the Raycast that created it. Opened anywhere else — another Mac, or a link somebody else put together — it shows the prefilled form instead, so nothing executes before you have seen it.

### Ask Raycast AI

Spellbook is an AI Extension: mention `@spellbook` in Quick AI or AI Chat (requires Raycast Pro).

```
@spellbook which of my saved commands deal with docker?
@spellbook show me the last 500 docker log lines of the worker
@spellbook save `kubectl get pods -n staging` as List Pods, with the namespace as a parameter
```

Raycast AI picks the matching template and fills in its parameters; it can only run commands that are in your library. Values are shell-quoted exactly as in the form, and every run first shows you the final command to confirm, flagged when it matches a destructive pattern. Inline commands return their output to the chat (they are stopped after 30 seconds, and very long output is cut to its tail); Terminal commands are handed to your terminal. Saving a command asks for confirmation too.

### Run modes

- **Inline** — output streams into a Raycast detail view with the exit code; Cmd+R re-runs. There is no keyboard input, so a command that prompts gets an immediate end of input.
- **Terminal** — the command is sent to Terminal.app or iTerm2 (choose in preferences). Use this for anything interactive or long-running (`ssh`, `docker logs -f`, `top`); inline runs are killed when the view closes. Multi-line commands are sent as they are. The first handoff asks for permission to control your terminal app.

### Safety

Commands matching destructive patterns (`rm -rf`, `sudo`, `dd of=`, forced pushes, `DROP TABLE`, piping downloads into a shell, …) require a confirmation dialog that shows the fully substituted command. Quoting protects against accidental word-splitting, but you author both templates and values — review what the preview shows.

## Storage

The library is a human-editable JSON file at `~/.config/spellbook/commands.json` (change the path in preferences — point it at your dotfiles repo and git becomes your sync layer). External edits are picked up on the next launch or with Reload Library (Cmd+R). A command whose parameters you reordered keeps that order in a `paramOrder` list. Frecency ranking, per-command last-used values/actions and the key that lets your Quicklinks run are stored locally by Raycast and intentionally kept out of the file, so the synced library stays clean.

The first inline run captures your login shell environment (so Homebrew paths work) and caches it; use **Refresh Shell Environment** after changing your PATH.
