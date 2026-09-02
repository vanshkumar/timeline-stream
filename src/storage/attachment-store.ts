import { App, TFile, TFolder, normalizePath } from "obsidian";
import { attachmentFolderForEntry } from "../domain/attachment-lifecycle";
import { createAttachmentPath } from "../domain/identity";
import type { AttachmentKind, EntryIdentity, StoredAttachment } from "../domain/entry";
import { ensureFolder } from "./folders";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/ogg": "ogg"
};

function extensionFromName(name: string): string | undefined {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name);
  return match?.[1]?.toLowerCase();
}

function chooseExtension(blob: Blob, name: string, kind: AttachmentKind): string {
  return MIME_EXTENSIONS[blob.type.toLowerCase()] ?? extensionFromName(name) ?? (kind === "image" ? "jpg" : "m4a");
}

function parentPath(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

export class AttachmentStore {
  private readonly freshAttachments = new Map<string, { resourcePath: string; size: number }>();

  constructor(private readonly app: App) {}

  async writeFile(identity: EntryIdentity, kind: AttachmentKind, file: File | Blob, name = "attachment"): Promise<StoredAttachment> {
    if (file.size <= 0) {
      throw new Error("The selected attachment is empty.");
    }
    const { id, path } = createAttachmentPath(identity, kind, chooseExtension(file, name, kind));
    const normalizedPath = normalizePath(path);
    await ensureFolder(this.app.vault, parentPath(normalizedPath));

    const bytes = await file.arrayBuffer();
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    let stored: TFile;
    if (existing instanceof TFile) {
      if (existing.stat.size !== bytes.byteLength) {
        throw new Error(`Attachment path collision at ${normalizedPath}.`);
      }
      stored = existing;
    } else if (existing) {
      throw new Error(`${normalizedPath} exists but is not a file.`);
    } else {
      stored = await this.app.vault.createBinary(normalizedPath, bytes);
    }

    if (stored.stat.size !== bytes.byteLength) {
      throw new Error(`Could not verify attachment ${normalizedPath}.`);
    }
    this.freshAttachments.set(normalizedPath, {
      resourcePath: this.app.vault.getResourcePath(stored),
      size: stored.stat.size
    });
    return {
      id,
      kind,
      path: normalizedPath,
      mimeType: file.type || "application/octet-stream",
      size: bytes.byteLength
    };
  }

  async verifyAll(attachments: StoredAttachment[]): Promise<void> {
    for (const attachment of attachments) {
      const path = normalizePath(attachment.path);
      const file = this.app.vault.getAbstractFileByPath(path);
      const fresh = this.freshAttachments.get(path);
      const verifiedFromVault = file instanceof TFile && file.stat.size === attachment.size;
      const verifiedFromWrite = !file && fresh?.size === attachment.size;
      if (!verifiedFromVault && !verifiedFromWrite) {
        throw new Error(`Attachment is missing or incomplete: ${attachment.path}`);
      }
      if (verifiedFromVault) this.freshAttachments.delete(path);
    }
  }

  releaseFresh(attachments: StoredAttachment[]): void {
    for (const attachment of attachments) {
      this.freshAttachments.delete(normalizePath(attachment.path));
    }
  }

  async trashOwnedBy(owner: Pick<EntryIdentity, "id" | "createdAt">): Promise<"trashed" | "absent"> {
    const path = attachmentFolderForEntry(owner);
    if (!path) {
      throw new Error("Refusing to trash attachments for an entry with an unsafe identity.");
    }

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (!existing) return "absent";
    if (!(existing instanceof TFolder)) {
      throw new Error(`Expected an attachment folder at ${path}.`);
    }
    await this.app.fileManager.trashFile(existing);
    return "trashed";
  }

  resourcePath(path: string): string | null {
    const normalizedPath = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (file instanceof TFile) {
      this.freshAttachments.delete(normalizedPath);
      return this.app.vault.getResourcePath(file);
    }
    return this.freshAttachments.get(normalizedPath)?.resourcePath ?? null;
  }
}

export type AttachmentVerifier = Pick<AttachmentStore, "verifyAll">;
export type OwnedAttachmentTrasher = Pick<AttachmentStore, "trashOwnedBy">;
