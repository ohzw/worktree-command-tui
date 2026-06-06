# worktree-command-tui

`worktree-command-tui` is a terminal UI (TUI) tool for operating multiple Git worktrees from one repository.
It helps you inspect, start, and stop per-worktree processes with quick keyboard-driven workflows.

## Features

- List and monitor worktrees for the current repository
- Start/stop worktree-specific commands
- Keep process handling centralized for each session
- Persist namespace-aware runtime state
- Support JSONC config (with comments and trailing commas)

## Requirements

- Node.js `>=20`
- A Git repository in the target working directory

## Installation

```bash
npm install -g @ohzw/worktree-command-tui
```

## Usage

### 1) Initialize configuration

Run this once in a repository root (or any subdirectory of the repository):

```bash
wctui init
```

This creates `.worktree-command-tui.jsonc` with a sensible default configuration.

To regenerate an existing configuration:

```bash
wctui init --force
```

### 2) Start the TUI

```bash
wctui
```

`worktree-command-tui` is still available as a compatibility alias.

If no configuration file is found, the CLI will prompt you to run `wctui init`.

## Security and network behavior

`wctui` executes the argv commands stored in `.worktree-command-tui.jsonc` when you press the matching keys. Treat repository config as trusted code:

- `Enter` starts `command` in the selected worktree.
- `i` runs `setupCommand`; package-manager install commands may run dependency lifecycle scripts.
- `e` runs `editorCommand` with the selected worktree path appended.

Review config before using those actions in an untrusted repository or worktree.

The TUI also reads pull request metadata with the GitHub CLI when `remote.origin.url` points at `github.com`. This uses `gh api`, your existing `gh` authentication, and a short timeout. Non-GitHub remote hosts are ignored by default.

## Configuration

The tool reads these files in this order:

1. `.worktree-command-tui.jsonc`
2. `.worktree-command-tui.json`

A minimal example of the generated config:

```jsonc
{
  // Session namespace used for logs/state
  "namespace": "worktree-command-tui",
  // Command executed in each selected worktree
  "command": ["npm", "run", "start"],
  // Optional setup command run manually in the selected worktree
  "setupCommand": ["npm", "install"],
  // Port used for cleanup/monitoring
  "port": 3000,
  // Required files that must exist in a worktree
  "requiredFiles": ["package.json"],
  // Optional command substrings considered orphaned processes
  "orphanMatchers": []
}
```

When `setupCommand` is configured, press `i` in the TUI to run it for the selected worktree.
It is never run automatically when switching worktrees.

## Development

```bash
npm install
npm run test          # Run test suite
npm run typecheck     # Run TypeScript type-check
npm run build         # Build distributable output to dist/
```

## License

MIT
