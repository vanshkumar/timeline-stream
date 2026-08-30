import { App, TFile, normalizePath } from "obsidian";
import { createEntryIdentity } from "../domain/identity";
import type { CommitRequest, EntryIdentity, ParsedEntry, StoredAttachment } from "../domain/entry";
import { EntryCodec, InvalidEntryError } from "./entry-codec";
import { ensureFolder } from "./folders";

export class ExistingEntryConflictError extends Error {}

function attachmentEmbeds(attachments: StoredAttachment[]): string {
  return attachments.map((attachment) => `![[${attachment.path}]]`).join("\n\n");
}

function composeBody(body: string, attachments: StoredAttachment[]): string {
  return [body.trim(), attachmentEmbeds(attachments)].filter(Boolean).join("\n\n");
}

function parentPath(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

export class StreamRepository {
  constructor(
    private readonly app: App,
    readonly codec: EntryCodec
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
    const verified = await this.app.vault.read(file);
    if (verified !== content) {
      throw new Error(`Could not verify the new entry at ${notePath}.`);
    }
    return this.codec.parse(notePath, verified);
  }

  async readDocument(fileOrPath: TFile | string): Promise<ParsedEntry> {
    const file = typeof fileOrPath === "string" ? this.fileAt(fileOrPath) : fileOrPath;
    const raw = await this.app.vault.cachedRead(file);
    return this.codec.parse(file.path, raw);
  }

  async readBody(fileOrPath: TFile | string): Promise<string> {
    return (await this.readDocument(fileOrPath)).body;
  }

  async editBody(fileOrPath: TFile | string, baseline: string, nextBody: string): Promise<ParsedEntry> {
    const file = typeof fileOrPath === "string" ? this.fileAt(fileOrPath) : fileOrPath;
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

  async trash(fileOrPath: TFile | string): Promise<void> {
    const file = typeof fileOrPath === "string" ? this.fileAt(fileOrPath) : fileOrPath;
    await this.app.fileManager.trashFile(file);
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
