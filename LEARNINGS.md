# Project Learnings

## What Has Worked

**[2026-08-29] — Obsidian plugin architecture**
- Observation: Keeping UUID/path generation, frontmatter encoding, slash parsing, conflict grouping, and the capture coordinator free of Obsidian runtime imports allowed the durability-sensitive behavior to run under Vitest without mocking the application.
- Action: Continue isolating new storage decisions in pure modules and keep Vault/FileManager calls behind the repository and attachment-store boundaries.
- Confidence: high

## Patterns and Preferences

**[2026-08-30] — Internal links in rendered cards**
- Observation: `MarkdownRenderer.render` creates and styles internal-link anchors but does not attach Markdown preview navigation behavior inside the React-backed custom `ItemView`.
- Action: Delegate card `click` and `auxclick` events for `a.internal-link` to `Workspace.openLinkText`, passing the saved entry path and `Keymap.isModEvent`, and bind the handlers through the renderer component lifecycle.
- Confidence: high

**[2026-08-30] — Plugin-to-composer requests**
- Observation: `StreamView` cannot await React mounting after `root.render`, the live React draft may be newer than `DraftStore`, and a successful in-flight send clears draft state.
- Action: Route plugin-originated composer prefills through a view-owned FIFO bridge, merge them with functional draft updates, and leave requests queued until any in-flight send finishes.
- Confidence: high

**[2026-08-30] — Timeline presentation order**
- Observation: `StreamIndex` can remain deterministically oldest-first while the Twitter-style view shows the newest page first by reversing only the sliced page; loading earlier then appends older entries without disturbing the current scroll position.
- Action: Keep index/storage ordering stable and implement chronology, top anchoring, and new-entry indicators within `StreamApp` and `Timeline`.
- Confidence: high

**[2026-08-30] — Stream view styling**
- Observation: A named CSS container on the full-height Stream app adapts reliably to narrow Obsidian leaves, and Obsidian's `setIcon` supplies interface icons without adding a runtime dependency; theme surfaces can remain native while brand and accessible action blues stay separate.
- Action: Keep future Stream presentation changes scoped to the view, use container queries for leaf-width breakpoints, retain Obsidian surface/text tokens, and source functional icons through `setIcon`.
- Confidence: high

**[2026-08-30] — Timeline-first compose navigation**
- Observation: Keeping `Timeline` mounted and inert beneath an opaque, app-local compose layer preserves its scroll position while an explicit FAB prevents saved drafts or open commands from replacing the default timeline; header-only actions such as `/today` become unsafe once their visible reset control is removed.
- Action: Keep timeline and compose as explicit states, flush drafts on dismissal and view teardown, return to the timeline only after a confirmed commit, and remove navigation commands whose state can no longer be seen and reset.
- Confidence: high

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

**[2026-08-30] — User documentation scope**
- Observation: Installation and smoke-test instructions did not state the everyday timeline workflow after the timeline-first redesign.
- Action: Keep the normal interaction summary concise and near the opening instructions; document the `+` composer, draft preservation, newest-first order, and earlier-page loading without duplicating visual details.
- Confidence: high

## What Has Failed
