# Project Learnings

## What Has Worked

**[2026-08-29] — Obsidian plugin architecture**
- Observation: Keeping UUID/path generation, frontmatter encoding, slash parsing, conflict grouping, and the capture coordinator free of Obsidian runtime imports allowed the durability-sensitive behavior to run under Vitest without mocking the application.
- Action: Continue isolating new storage decisions in pure modules and keep Vault/FileManager calls behind the repository and attachment-store boundaries.
- Confidence: high

## Patterns and Preferences

**[2026-08-29] — Project tooling**
- Observation: This workspace exposes bundled Node and pnpm rather than npm, and pnpm requires `esbuild` to be explicitly allowed in `pnpm-workspace.yaml`; the newest published Obsidian typings available during setup were 1.13.1.
- Action: Use the committed pnpm lockfile, retain the esbuild allow-list, and keep `manifest.json` and the `obsidian` package aligned at 1.13.1 until deliberately upgraded together.
- Confidence: high

## What Has Failed
