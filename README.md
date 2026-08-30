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

## Private installation

Keep this repository outside the vault. In Obsidian, configure `.obsidian-mac` on the Mac and `.obsidian-ios` on the iPhone under **Settings → Files and Links → Override config folder**.

From the Mac:

```sh
pnpm run deploy -- --vault /absolute/path/to/your/vault
```

The command tests and builds the plugin, archives the release under `dist/releases/<version>/`, and copies `main.js`, `manifest.json`, and `styles.css` into both configuration folders. Close Obsidian on iPhone before updating, wait for iCloud to finish syncing all three files, then reopen Obsidian and enable or reload Personal Stream.

## Opening quickly

- Add **Personal Stream: Open personal stream** to the mobile toolbar or assign it as the mobile pull-down Quick Action.
- The deep link is `obsidian://personal-stream?vault=YOUR%20VAULT`.
- For a Home Screen icon, create an Apple Shortcut containing only **Open URLs** with that link, then add the Shortcut to the Home Screen. It does not use Shortcuts for text entry.

## Slash commands

- `/tag idea project` followed by the entry on later lines attaches YAML tags.
- `/todo Buy milk` creates a Markdown task.
- `/today` filters the stream to entries captured today.
- Start a literal slash entry with `//`.

## iPhone smoke test

Before relying on media capture, verify on the actual iPhone:

1. Open the stream from Obsidian and the deep link.
2. Send Markdown text and open the resulting normal note.
3. Choose a photo and take a photo. A system source chooser is an acceptable camera fallback.
4. Record about 30 seconds of audio, stop it, send it, and play it from the rendered entry.
5. Restart Obsidian with an unsent draft and confirm it returns.
6. Create one offline entry on each device, reconnect, and confirm both survive.

Audio recording depends on the browser media APIs exposed by Obsidian's iOS WebView. Background and locked-phone recording are intentionally unsupported.

## Data safety notes

- Attachments are written before the Markdown note; the note acts as the commit marker.
- Failed sends retain their draft and attachment paths for retry.
- Deleting an entry moves only its Markdown file through Obsidian's configured trash behavior. Attachments are retained.
- iCloud conflicts are surfaced and never automatically merged or deleted.
- iCloud sync is not a backup. Keep a downloaded Mac copy and use Obsidian File Recovery plus a separate backup.
