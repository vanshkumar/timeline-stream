import { type App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type { CommitRequest, EntryIdentity, StoredAttachment } from "../../src/domain/entry";
import { EntryCodec } from "../../src/storage/entry-codec";
import { StreamRepository } from "../../src/storage/stream-repository";

const identity: EntryIdentity = {
  id: "01991f2f-0d36-7c6e-93a4-6a0a96d8596f",
  createdAt: "2026-08-30T01:45:12.347+00:00",
  notePath: "Stream/entries/2026/08/20260830T014512.347+0000--01991f2f-0d36-7c6e-93a4-6a0a96d8596f.md",
  year: "2026",
  month: "08"
};

const attachment: StoredAttachment = {
  id: "01991f30-3861-7ed0-b476-82040fbd9a7f",
  kind: "image",
  path: `Stream/attachments/2026/08/${identity.id}/image--01991f30-3861-7ed0-b476-82040fbd9a7f.jpg`,
  mimeType: "image/jpeg",
  size: 1_024
};

describe("StreamRepository.commit", () => {
  it("resolves an attachment post from the created content without reading the new note back", async () => {
    const file = Object.assign(new TFile(), {
      path: identity.notePath,
      stat: { ctime: 0, mtime: 0, size: 0 }
    });
    const getAbstractFileByPath = vi.fn((path: string) => path === identity.notePath ? null : { path });
    const create = vi.fn(async () => file);
    const read = vi.fn(async () => {
      throw new Error("A successful create must not depend on a post-create read.");
    });
    const cachedRead = vi.fn(async () => {
      throw new Error("The first card render must not depend on a cache read.");
    });
    const app = {
      vault: { getAbstractFileByPath, create, read, cachedRead }
    } as unknown as App;
    const repository = new StreamRepository(
      app,
      new EntryCodec(),
      { trashOwnedBy: vi.fn(async () => "absent" as const) }
    );
    const request: CommitRequest = {
      identity,
      body: "Photo caption",
      tags: [],
      attachments: [attachment]
    };

    const committed = await repository.commit(request);
    expect(committed).toMatchObject({
      path: identity.notePath,
      metadata: {
        stream_id: identity.id,
        stream_created_at: identity.createdAt
      },
      body: expect.stringContaining(`![[${attachment.path}]]`)
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      identity.notePath,
      expect.stringContaining(`![[${attachment.path}]]`)
    );
    expect(read).not.toHaveBeenCalled();
    await expect(repository.readDocument(identity.notePath)).resolves.toBe(committed);
    expect(cachedRead).not.toHaveBeenCalled();
  });
});
