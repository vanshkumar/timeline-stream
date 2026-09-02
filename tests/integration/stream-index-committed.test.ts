import { type MetadataCache, TFile, type Vault } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type { EntrySummary } from "../../src/domain/entry";
import { createEntryIdentity } from "../../src/domain/identity";
import { StreamIndex } from "../../src/index/stream-index";
import { EntryCodec } from "../../src/storage/entry-codec";

describe("StreamIndex committed entries", () => {
  it("keeps a confirmed post when an older cache rebuild finishes without it", async () => {
    const codec = new EntryCodec();
    const earlierIdentity = createEntryIdentity(
      new Date("2026-09-02T15:00:00.000Z"),
      "01991f2f-0d36-7c6e-93a4-6a0a96d8596e"
    );
    const earlierFile = Object.assign(new TFile(), {
      path: earlierIdentity.notePath,
      stat: { ctime: 1, mtime: 1, size: 100 }
    });
    let finishRead!: (raw: string) => void;
    const cachedRead = vi.fn(() => new Promise<string>((resolve) => {
      finishRead = resolve;
    }));
    const vault = {
      getMarkdownFiles: vi.fn(() => [earlierFile]),
      cachedRead
    } as unknown as Vault;
    const metadataCache = { getFileCache: vi.fn(() => null) } as unknown as MetadataCache;
    const index = new StreamIndex(vault, metadataCache, codec);
    const rebuild = index.rebuild();
    const committed: EntrySummary = {
      path: "Stream/entries/2026/09/committed.md",
      id: "committed-id",
      createdAt: "2026-09-02T10:00:00.000-07:00",
      tags: ["photo"],
      mtime: 2,
      conflict: "none",
      duplicateCount: 1
    };

    expect(cachedRead).toHaveBeenCalledOnce();
    index.recordCommitted(committed);
    expect(index.getEntries()).toContainEqual(committed);

    finishRead(codec.encode({ identity: earlierIdentity, body: "Earlier" }));
    await rebuild;

    expect(index.getEntries()).toEqual([
      expect.objectContaining({ path: earlierIdentity.notePath }),
      committed
    ]);
  });

  it("ignores an older rebuild that finishes after a newer snapshot", async () => {
    const codec = new EntryCodec();
    const earlierIdentity = createEntryIdentity(
      new Date("2026-09-02T15:00:00.000Z"),
      "01991f2f-0d36-7c6e-93a4-6a0a96d8596e"
    );
    const committedIdentity = createEntryIdentity(
      new Date("2026-09-02T17:00:00.000Z"),
      "01991f2f-0d36-7c6e-93a4-6a0a96d8596f"
    );
    const earlierFile = Object.assign(new TFile(), {
      path: earlierIdentity.notePath,
      stat: { ctime: 1, mtime: 1, size: 100 }
    });
    const committedFile = Object.assign(new TFile(), {
      path: committedIdentity.notePath,
      stat: { ctime: 2, mtime: 2, size: 100 }
    });
    let finishOlderRead!: (raw: string) => void;
    let cacheReady = false;
    let snapshot = 0;
    const vault = {
      getMarkdownFiles: vi.fn(() => ++snapshot === 1 ? [earlierFile] : [earlierFile, committedFile]),
      cachedRead: vi.fn(() => new Promise<string>((resolve) => {
        finishOlderRead = resolve;
      }))
    } as unknown as Vault;
    const metadataCache = {
      getFileCache: vi.fn((file: TFile) => cacheReady ? {
        frontmatter: {
          stream_schema: 1,
          stream_id: file === earlierFile ? earlierIdentity.id : committedIdentity.id,
          stream_created_at: file === earlierFile ? earlierIdentity.createdAt : committedIdentity.createdAt
        }
      } : null)
    } as unknown as MetadataCache;
    const index = new StreamIndex(vault, metadataCache, codec);
    const olderRebuild = index.rebuild();
    const committed: EntrySummary = {
      path: committedIdentity.notePath,
      id: committedIdentity.id,
      createdAt: committedIdentity.createdAt,
      tags: [],
      mtime: 2,
      conflict: "none",
      duplicateCount: 1
    };
    index.recordCommitted(committed);

    cacheReady = true;
    await index.rebuild();
    finishOlderRead(codec.encode({ identity: earlierIdentity, body: "Earlier" }));
    await olderRebuild;

    expect(index.getEntries().map((entry) => entry.path)).toEqual([
      earlierIdentity.notePath,
      committedIdentity.notePath
    ]);
  });
});
