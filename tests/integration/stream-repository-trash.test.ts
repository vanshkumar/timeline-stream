import { type App, TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntryIdentity } from "../../src/domain/entry";
import { EntryCodec } from "../../src/storage/entry-codec";
import { PartialEntryDeletionError, StreamRepository } from "../../src/storage/stream-repository";

const owner: EntryIdentity = {
  id: "01991f2f-0d36-7c6e-93a4-6a0a96d8596f",
  createdAt: "2026-08-30T01:45:12.347+00:00",
  notePath: "Stream/entries/2026/08/20260830T014512.347+0000--01991f2f-0d36-7c6e-93a4-6a0a96d8596f.md",
  year: "2026",
  month: "08"
};

const attachmentFolder = `Stream/attachments/${owner.year}/${owner.month}/${owner.id}`;

function mockFile(path: string): TFile {
  const file = new TFile();
  const name = path.split("/").at(-1) ?? path;
  const extension = name.includes(".") ? name.split(".").at(-1) ?? "" : "";
  Object.assign(file, {
    path,
    name,
    basename: extension ? name.slice(0, -(extension.length + 1)) : name,
    extension,
    parent: null,
    stat: { ctime: 0, mtime: 0, size: 0 }
  });
  return file;
}

function encodedEntry(codec: EntryCodec, identity: EntryIdentity, body = "Entry body"): string {
  return codec.encode({ identity, body });
}

interface Survivor {
  file: TFile;
  raw: string;
}

function harness(options: {
  survivors?: Survivor[];
  resolvedLinks?: Record<string, Record<string, number>>;
  unresolvedLinks?: Record<string, Record<string, number>>;
  noteTrashError?: Error;
  attachmentTrashError?: Error;
  attachmentFolderExists?: boolean;
} = {}) {
  const codec = new EntryCodec();
  const target = mockFile(owner.notePath);
  const survivors = options.survivors ?? [];
  const rawByPath = new Map<string, string>([
    [target.path, encodedEntry(codec, owner)],
    ...survivors.map(({ file, raw }) => [file.path, raw] as const)
  ]);
  const order: string[] = [];

  const trashFile = vi.fn(async (file: TFile) => {
    expect(file).toBe(target);
    order.push("note");
    if (options.noteTrashError) throw options.noteTrashError;
  });
  const trashOwnedBy = vi.fn(async () => {
    order.push("attachments");
    if (options.attachmentTrashError) throw options.attachmentTrashError;
    return "trashed" as const;
  });
  const cachedRead = vi.fn(async (file: TFile) => {
    const raw = rawByPath.get(file.path);
    if (raw === undefined) throw new Error(`Unexpected read: ${file.path}`);
    return raw;
  });
  const getMarkdownFiles = vi.fn(() => [target, ...survivors.map(({ file }) => file)]);
  const getAbstractFileByPath = vi.fn((path: string) =>
    options.attachmentFolderExists !== false && path === attachmentFolder ? { path } : null
  );

  const app = {
    vault: { cachedRead, getMarkdownFiles, getAbstractFileByPath },
    fileManager: { trashFile },
    metadataCache: {
      resolvedLinks: options.resolvedLinks ?? {},
      unresolvedLinks: options.unresolvedLinks ?? {}
    }
  } as unknown as App;
  const repository = new StreamRepository(app, codec, { trashOwnedBy });

  return { repository, target, order, trashFile, trashOwnedBy, getMarkdownFiles, getAbstractFileByPath };
}

describe("StreamRepository.trash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trashes the note before the last owner's attachment folder", async () => {
    const attachment = `${attachmentFolder}/image--asset.jpg`;
    const { repository, target, order, trashOwnedBy } = harness({
      resolvedLinks: { [owner.notePath]: { [attachment]: 1 } }
    });

    await expect(repository.trash(target)).resolves.toEqual({ attachmentDisposition: "trashed" });

    expect(order).toEqual(["note", "attachments"]);
    expect(trashOwnedBy).toHaveBeenCalledWith({ id: owner.id, createdAt: owner.createdAt });
  });

  it("retains attachments while another stream entry has the same ID", async () => {
    const codec = new EntryCodec();
    const conflictIdentity = {
      ...owner,
      notePath: "Stream/entries/2026/08/synced-conflict-copy.md"
    };
    const conflict = mockFile(conflictIdentity.notePath);
    const { repository, target, trashOwnedBy } = harness({
      survivors: [{ file: conflict, raw: encodedEntry(codec, conflictIdentity) }]
    });

    await expect(repository.trash(target)).resolves.toEqual({ attachmentDisposition: "retain-same-id" });

    expect(trashOwnedBy).not.toHaveBeenCalled();
  });

  it("skips survivor scans when the entry has no attachment folder", async () => {
    const { repository, target, trashOwnedBy, getMarkdownFiles } = harness({ attachmentFolderExists: false });

    await expect(repository.trash(target)).resolves.toEqual({ attachmentDisposition: "absent" });

    expect(getMarkdownFiles).not.toHaveBeenCalled();
    expect(trashOwnedBy).not.toHaveBeenCalled();
  });

  it("retains attachments referenced by another stream entry", async () => {
    const codec = new EntryCodec();
    const consumerIdentity: EntryIdentity = {
      id: "01991f30-3861-7ed0-b476-82040fbd9a7f",
      createdAt: "2026-08-30T01:46:20.001+00:00",
      notePath: "Stream/entries/2026/08/20260830T014620.001+0000--01991f30-3861-7ed0-b476-82040fbd9a7f.md",
      year: "2026",
      month: "08"
    };
    const consumer = mockFile(consumerIdentity.notePath);
    const { repository, target, trashOwnedBy } = harness({
      survivors: [{
        file: consumer,
        raw: encodedEntry(codec, consumerIdentity, `![[${attachmentFolder}/image--asset.jpg]]`)
      }]
    });

    await expect(repository.trash(target)).resolves.toEqual({ attachmentDisposition: "retain-reference" });

    expect(trashOwnedBy).not.toHaveBeenCalled();
  });

  it.each(["resolvedLinks", "unresolvedLinks"] as const)("retains attachments linked from a live non-stream note through %s", async (linkMap) => {
    const reference = mockFile("Notes/reference.md");
    const attachment = `${attachmentFolder}/image--asset.jpg`;
    const { repository, target, trashOwnedBy } = harness({
      survivors: [{ file: reference, raw: "The metadata cache owns this link snapshot." }],
      [linkMap]: { [reference.path]: { [attachment]: 1 } }
    });

    await expect(repository.trash(target)).resolves.toEqual({ attachmentDisposition: "retain-reference" });

    expect(trashOwnedBy).not.toHaveBeenCalled();
  });

  it("retains an exact reference in a regular note before link metadata catches up", async () => {
    const reference = mockFile("Notes/new-reference.md");
    const attachment = `${attachmentFolder}/image--asset.jpg`;
    const { repository, target, trashOwnedBy } = harness({
      survivors: [{ file: reference, raw: `![[${attachment}]]` }]
    });

    await expect(repository.trash(target)).resolves.toEqual({ attachmentDisposition: "retain-reference" });
    expect(trashOwnedBy).not.toHaveBeenCalled();
  });

  it("does not inspect or trash attachments when moving the note fails", async () => {
    const failure = new Error("trash unavailable");
    const { repository, target, trashOwnedBy, getMarkdownFiles, getAbstractFileByPath } = harness({ noteTrashError: failure });

    await expect(repository.trash(target)).rejects.toBe(failure);

    expect(getMarkdownFiles).not.toHaveBeenCalled();
    expect(getAbstractFileByPath).not.toHaveBeenCalled();
    expect(trashOwnedBy).not.toHaveBeenCalled();
  });

  it("reports partial cleanup when the note moved but attachment trash fails", async () => {
    const failure = new Error("attachment trash unavailable");
    const { repository, target, order } = harness({ attachmentTrashError: failure });
    const deletion = repository.trash(target);

    await expect(deletion).rejects.toThrow(PartialEntryDeletionError);
    await expect(deletion).rejects.toThrow(
      "The entry was moved to trash, but its attachments could not be moved"
    );
    expect(order).toEqual(["note", "attachments"]);
  });
});
