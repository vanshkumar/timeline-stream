import { App, TFile, normalizePath } from "obsidian";
import {
  attachmentFolderForEntry,
  decideAttachmentCleanup,
  hasLiveResolvedReference,
  type AttachmentCleanupDecision,
  type AttachmentConsumerSnapshot
} from "../domain/attachment-lifecycle";
import { ENTRY_ROOT } from "../domain/entry";
import { createEntryIdentity } from "../domain/identity";
import type { CommitRequest, EntryIdentity, ParsedEntry, StoredAttachment } from "../domain/entry";
import type { OwnedAttachmentTrasher } from "./attachment-store";
import { EntryCodec, InvalidEntryError } from "./entry-codec";
import { ensureFolder } from "./folders";

export class ExistingEntryConflictError extends Error {}
export class PartialEntryDeletionError extends Error {}

export type AttachmentTrashDisposition =
  | Exclude<AttachmentCleanupDecision, "trash">
  | "trashed"
  | "absent"
  | "retain-unsafe"
  | "retain-unreadable";

export interface TrashEntryResult {
  attachmentDisposition: AttachmentTrashDisposition;
}

function attachmentEmbeds(attachments: StoredAttachment[]): string {
  return attachments.map((attachment) => `![[${attachment.path}]]`).join("\n\n");
}

function composeBody(body: string, attachments: StoredAttachment[]): string {
  return [body.trim(), attachmentEmbeds(attachments)].filter(Boolean).join("\n\n");
}

function parentPath(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

function isStreamEntryPath(path: string): boolean {
  return path.startsWith(`${ENTRY_ROOT}/`) && path.toLowerCase().endsWith(".md");
}

export class StreamRepository {
  private readonly freshDocuments = new Map<string, ParsedEntry>();

  constructor(
    private readonly app: App,
    readonly codec: EntryCodec,
    private readonly attachments: OwnedAttachmentTrasher
  ) {}

  async commit(request: CommitRequest): Promise<ParsedEntry> {
    const notePath = normalizePath(request.identity.notePath);
    const content = this.codec.encode({
      identity: request.identity,
      body: composeBody(request.body, request.attachments),
      tags: request.tags
    });

    const existing = this.app.vault.getAbstractFileByPath(notePath);
    if (existing) {
      if (!(existing instanceof TFile)) {
        throw new ExistingEntryConflictError(`${notePath} exists but is not a file.`);
      }
      const existingContent = await this.app.vault.read(existing);
      if (existingContent === content) {
        return this.codec.parse(notePath, existingContent);
      }
      throw new ExistingEntryConflictError(`An entry already exists at ${notePath} with different content.`);
    }

    await ensureFolder(this.app.vault, parentPath(notePath));
    const file = await this.app.vault.create(notePath, content);
    const committed = this.codec.parse(file.path, content);
    this.freshDocuments.set(file.path, committed);
    return committed;
  }

  async readDocument(fileOrPath: TFile | string): Promise<ParsedEntry> {
    const path = normalizePath(typeof fileOrPath === "string" ? fileOrPath : fileOrPath.path);
    const fresh = this.freshDocuments.get(path);
    if (fresh) {
      this.freshDocuments.delete(path);
      return fresh;
    }
    const file = typeof fileOrPath === "string" ? this.fileAt(fileOrPath) : fileOrPath;
    const raw = await this.app.vault.cachedRead(file);
    return this.codec.parse(file.path, raw);
  }

  async readBody(fileOrPath: TFile | string): Promise<string> {
    return (await this.readDocument(fileOrPath)).body;
  }

  async editBody(fileOrPath: TFile | string, baseline: string, nextBody: string): Promise<ParsedEntry> {
    const file = typeof fileOrPath === "string" ? this.fileAt(fileOrPath) : fileOrPath;
    this.freshDocuments.delete(file.path);
    await this.app.vault.process(file, (current) => this.codec.replaceBodyIfUnchanged(current, baseline, nextBody));
    return this.readDocument(file);
  }

  async duplicate(fileOrPath: TFile | string): Promise<ParsedEntry> {
    const original = await this.readDocument(fileOrPath);
    const identity = createEntryIdentity();
    const tags = Array.isArray(original.metadata.tags) ? original.metadata.tags.map(String) : [];
    const managedKeys = new Set(["stream_schema", "stream_id", "stream_created_at", "stream_duplicated_from", "tags"]);
    const userFrontmatter = Object.fromEntries(
      Object.entries(original.metadata).filter(([key]) => !managedKeys.has(key))
    );

    const content = this.codec.encode({
      identity,
      body: original.body,
      tags,
      duplicatedFrom: original.metadata.stream_id,
      userFrontmatter
    });
    await ensureFolder(this.app.vault, parentPath(identity.notePath));
    const file = await this.app.vault.create(identity.notePath, content);
    return this.codec.parse(file.path, await this.app.vault.read(file));
  }

  async trash(fileOrPath: TFile | string): Promise<TrashEntryResult> {
    const file = typeof fileOrPath === "string" ? this.fileAt(fileOrPath) : fileOrPath;
    const originalPath = file.path;
    const document = await this.readDocument(file);
    const owner = {
      id: document.metadata.stream_id,
      createdAt: document.metadata.stream_created_at
    };
    const attachmentFolder = attachmentFolderForEntry(owner);

    await this.app.fileManager.trashFile(file);

    if (!attachmentFolder) {
      return { attachmentDisposition: "retain-unsafe" };
    }
    if (!this.app.vault.getAbstractFileByPath(attachmentFolder)) {
      return { attachmentDisposition: "absent" };
    }

    const survivors: AttachmentConsumerSnapshot[] = [];
    for (const survivor of this.app.vault.getMarkdownFiles()) {
      if (survivor.path === originalPath || survivor.path.startsWith(".trash/")) continue;
      let raw: string;
      try {
        raw = await this.app.vault.cachedRead(survivor);
      } catch {
        return { attachmentDisposition: "retain-unreadable" };
      }

      let id: string | undefined;
      if (isStreamEntryPath(survivor.path)) {
        try {
          id = this.codec.parse(survivor.path, raw).metadata.stream_id;
        } catch {
          // A malformed entry can still retain an attachment through an exact path reference below.
        }
      }
      survivors.push(id === undefined ? { raw } : { id, raw });
    }

    const decision = decideAttachmentCleanup(owner.id, attachmentFolder, survivors);
    if (decision !== "trash") {
      return { attachmentDisposition: decision };
    }

    const liveSourcePaths = new Set(
      this.app.vault.getMarkdownFiles()
        .map((candidate) => candidate.path)
        .filter((path) => path !== originalPath && !path.startsWith(".trash/"))
    );
    if (
      hasLiveResolvedReference(attachmentFolder, liveSourcePaths, this.app.metadataCache.resolvedLinks) ||
      hasLiveResolvedReference(attachmentFolder, liveSourcePaths, this.app.metadataCache.unresolvedLinks ?? {})
    ) {
      return { attachmentDisposition: "retain-reference" };
    }

    try {
      const attachmentDisposition = await this.attachments.trashOwnedBy(owner);
      return { attachmentDisposition };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      throw new PartialEntryDeletionError(
        `The entry was moved to trash, but its attachments could not be moved: ${message}`,
        { cause: caught }
      );
    }
  }

  async open(fileOrPath: TFile | string): Promise<void> {
    const file = typeof fileOrPath === "string" ? this.fileAt(fileOrPath) : fileOrPath;
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  getFile(path: string): TFile | null {
    const abstract = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return abstract instanceof TFile ? abstract : null;
  }

  private fileAt(path: string): TFile {
    const file = this.getFile(path);
    if (!file) {
      throw new InvalidEntryError(`Entry not found: ${path}`);
    }
    return file;
  }
}

export type EntryCommitter = Pick<StreamRepository, "commit">;
export type EntryIdentityFactory = () => EntryIdentity;
