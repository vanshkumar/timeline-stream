# Project Learnings

## What Has Worked

**[2026-08-29] — Obsidian plugin architecture**
- Observation: Keeping UUID/path generation, frontmatter encoding, slash parsing, conflict grouping, and the capture coordinator free of Obsidian runtime imports allowed the durability-sensitive behavior to run under Vitest without mocking the application.
- Action: Continue isolating new storage decisions in pure modules and keep Vault/FileManager calls behind the repository and attachment-store boundaries.
- Confidence: high

## Patterns and Preferences

**[2026-08-30] — Installer runtime discovery**
- Observation: The user's Node and npm installations are managed by mise and may not be directly available on `PATH` in a non-interactive shell, while `mise exec --` resolves both correctly.
- Action: Keep the local installer independent of pnpm and have its wrapper try active Node/npm, then mise-managed Node/npm, before falling back to Node/pnpm.
- Confidence: high

**[2026-08-30] — Local vault installation**
- Observation: The Personal iCloud vault uses the standard shared `.obsidian` configuration folder, and the provided path may be a note rather than the vault root.
- Action: Keep the personal target in the ignored `.personal-stream-install.json`, locate the vault by walking upward to the configured Obsidian folder, and preserve plugin-local data when replacing build artifacts.
- Confidence: high

**[2026-08-29] — Project tooling**
- Observation: This workspace exposes bundled Node and pnpm rather than npm, and pnpm requires `esbuild` to be explicitly allowed in `pnpm-workspace.yaml`; the newest published Obsidian typings available during setup were 1.13.1.
- Action: Use the committed pnpm lockfile, retain the esbuild allow-list, and keep `manifest.json` and the `obsidian` package aligned at 1.13.1 until deliberately upgraded together.
- Confidence: high

**[2026-08-30] — GitHub publishing**
- Observation: GitHub CLI credentials stored in the macOS keyring appear invalid inside the restricted sandbox but authenticate correctly when the CLI is allowed to access the host keyring.
- Action: Retry GitHub CLI operations with approved host access before treating the saved account as logged out.
- Confidence: high

## What Has Failed
