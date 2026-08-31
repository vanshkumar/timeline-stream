# Personal Stream

A private, offline-first Obsidian plugin for messaging yourself. Every committed entry is an ordinary Markdown file and every attachment is an ordinary media file inside the vault. The plugin has no account, backend, telemetry, external database, or content sync layer.

## Storage

Entries are created under `Stream/entries/YYYY/MM/`. Attachments are stored under `Stream/attachments/YYYY/MM/<entry-id>/`. Each entry and attachment receives a UUIDv7 identifier. The in-app index is derived from Markdown frontmatter and is never persisted.

## Development

Requirements: a current Node.js release, pnpm, and Obsidian 1.13.1 or newer.

```sh
pnpm install
pnpm run check
```

`pnpm run dev` watches and rebuilds `main.js`. Runtime source must use Obsidian Vault/FileManager APIs and browser APIs only; Node filesystem APIs are restricted to development scripts.

## Local installation

Keep this repository outside the vault. Create the local, Git-ignored install configuration once:

```sh
cp .personal-stream-install.example.json .personal-stream-install.json
```

Set `target` to either the vault or any existing note inside it. The installer walks upward to find the configured Obsidian folder, builds the plugin, and preserves plugin-local data while updating only `main.js`, `manifest.json`, and `styles.css`.

Install or update with:

```sh
./install.sh
```

The wrapper supports Node/npm activated in the current shell, Node/npm managed by mise, or Node/pnpm. Its install command does not require pnpm specifically.

Then reload Obsidian and enable **Personal Stream** under **Settings → Community plugins**. When the vault and its `.obsidian` folder are synced through iCloud, the same installed bundle becomes available on iPhone after iCloud finishes syncing.

You can also override the saved destination for one run:

```sh
pnpm run install:local -- --target /absolute/path/to/a/vault/or/note.md
```

## Separate Mac and iPhone config folders

If the vault uses `.obsidian-mac` on the Mac and `.obsidian-ios` on the iPhone under **Settings → Files and Links → Override config folder**, use the dual-config deployment command instead.

From the Mac:

```sh
pnpm run deploy -- --vault /absolute/path/to/your/vault
```

The command tests and builds the plugin, archives the release under `dist/releases/<version>/`, and copies `main.js`, `manifest.json`, and `styles.css` into both configuration folders. Close Obsidian on iPhone before updating, wait for iCloud to finish syncing all three files, then reopen Obsidian and enable or reload Personal Stream.

## Opening quickly

- Add **Personal Stream: Open personal stream** to the mobile toolbar or assign it as the mobile pull-down Quick Action.
- The deep link is `obsidian://personal-stream?vault=YOUR%20VAULT`.
- For a Home Screen icon, create an Apple Shortcut containing only **Open URLs** with that link, then add the Shortcut to the Home Screen. It does not use Shortcuts for text entry.

The timeline opens newest-first. Tap `+` to compose; closing the composer preserves the draft, and **Load earlier** appends older entries.

## Quote a note selection

On desktop, highlight text in a Markdown note and run **Quote selection to personal stream**. You can optionally assign the command a hotkey in Obsidian. Review or comment on the prefilled Markdown, then press **Post** to send it normally.

## Slash commands

- `/tag idea project` followed by the entry on later lines attaches YAML tags.
- `/todo Buy milk` creates a Markdown task.
- Start a literal slash entry with `//`.

## iPhone smoke test

Before relying on media capture, verify on the actual iPhone:

1. Open the stream from Obsidian and the deep link.
2. Tap `+`, send Markdown text, and open the resulting normal note.
3. Choose a photo and take a photo. A system source chooser is an acceptable camera fallback.
4. Record about 30 seconds of audio, stop it, send it, and play it from the rendered entry.
5. Restart Obsidian with an unsent draft, tap `+`, and confirm the draft returns.
6. Create one offline entry on each device, reconnect, and confirm both survive.

Audio recording depends on the browser media APIs exposed by Obsidian's iOS WebView. Background and locked-phone recording are intentionally unsupported.

## Data safety notes

- Attachments are written before the Markdown note; the note acts as the commit marker.
- Failed sends retain their draft and attachment paths for retry.
- Deleting an entry moves only its Markdown file through Obsidian's configured trash behavior. Attachments are retained.
- iCloud conflicts are surfaced and never automatically merged or deleted.
- iCloud sync is not a backup. Keep a downloaded Mac copy and use Obsidian File Recovery plus a separate backup.
