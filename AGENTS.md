# AGENTS.md

Repository instructions for Codex and other coding agents working in this project.

## Startup Context

At the start of every new task or fresh context, read these files before analysis or code changes:

1. `CLAUDE.md`
2. `ARCHITECTURE.md`
3. `DESIGN_NOTES.md`

On Windows, always read these Markdown files with explicit UTF-8 decoding. Do not rely on PowerShell's default text decoding.

Recommended PowerShell pattern:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[System.IO.File]::ReadAllText((Resolve-Path 'CLAUDE.md'), [System.Text.Encoding]::UTF8)
```

Use the same explicit UTF-8 pattern for `ARCHITECTURE.md` and `DESIGN_NOTES.md`.

## Project Rules

Follow the guardrails and workflow defined in `CLAUDE.md`.

Important defaults:

- Ask when required information is missing.
- Do not modify code unless the user has agreed.
- Do not assume details that were not provided or discovered from the repository.
- Do not skip analysis and jump directly to a final answer.
- For Feature or Refactor work, confirm that a complete root-level `spec.md` exists and that the user has approved the relevant steps before implementation.

## Common Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
```
