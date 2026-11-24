# Spellbook Changelog

## [Initial Version] - {PR_MERGE_DATE}

- Search Commands: fuzzy search over your saved commands, frecency-sorted; Enter repeats your last action with the last-used values, Cmd+Enter opens a prefilled override form with a live final-command preview.
- Save Command: quick capture with `{{param=default}}` placeholders, clipboard prefill, and live parameter detection. Reorder the parameters to choose the order the form asks for them.
- Inline runs stream output into Raycast; terminal runs hand off to Terminal.app or iTerm2, multi-line commands included.
- Quicklinks: run any saved command straight from Root Search, with an alias or a hotkey.
- Raycast AI: ask `@spellbook` to find a saved command, fill in its parameters and run it, or to save a new one. Every run shows the exact command for confirmation first.
- Dangerous commands (rm -rf, sudo, forced push, …) require confirmation showing the exact resolved command.
- Library stored as human-editable JSON at `~/.config/spellbook/commands.json` (dotfile/git syncable).
