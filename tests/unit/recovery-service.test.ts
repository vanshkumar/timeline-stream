import type { MetadataCache, TFile, Vault } from "obsidian";
import { describe, expect, it } from "vitest";
import type { DraftState } from "../../src/domain/entry";
import { RecoveryService } from "../../src/storage/recovery-service";

type ResolvedLinks = Record<string, Record<string, number>>;

const draft: DraftState = {
  body: "",
  tags: [],
  attachments: [],
  phase: "draft",
  updatedAt: 0
};

function file(path: string): TFile {
  return { path } as TFile;
}

function recoveryService(
  filePaths: string[],
  markdownPaths: string[],
  resolvedLinks: ResolvedLinks = {},
  unresolvedLinks: ResolvedLinks = {}
): RecoveryService {
  const vault = {
    getFiles: () => filePaths.map(file),
    getMarkdownFiles: () => markdownPaths.map(file)
  } as unknown as Vault;
  const metadataCache = { resolvedLinks, unresolvedLinks } as unknown as MetadataCache;
  return new RecoveryService(vault, metadataCache);
}

describe("RecoveryService", () => {
  it("counts each truly orphaned owner once and ignores references from trashed notes", () => {
    const orphanOwner = "orphan-owner";
    const liveOwner = "live-owner";
    const orphanFolder = `Stream/attachments/2026/08/${orphanOwner}`;
    const trashedSource = ".trash/Stream/entries/deleted.md";
    const service = recoveryService(
      [
        `${orphanFolder}/image--one.jpg`,
        `${orphanFolder}/audio--two.m4a`,
        `Stream/attachments/2026/08/${liveOwner}/image--live.jpg`,
        "Notes/not-an-attachment.md"
      ],
      [trashedSource],
      { [trashedSource]: { [`${orphanFolder}/image--one.jpg`]: 1 } }
    );

    expect(service.scan(new Set([liveOwner]), 0, draft)).toEqual({
      pendingDraft: false,
      orphanAttachmentCount: 1,
      malformedEntryCount: 0
    });
  });

  it("does not count an owner folder referenced by a live note", () => {
    const referencedOwner = "referenced-owner";
    const attachmentPath = `Stream/attachments/2026/08/${referencedOwner}/image--asset-id.jpg`;
    const liveSource = "Notes/gallery.md";
    const service = recoveryService(
      [attachmentPath],
      [liveSource],
      { [liveSource]: { [attachmentPath]: 1 } }
    );

    expect(service.scan(new Set(), 0, draft).orphanAttachmentCount).toBe(0);
  });

  it("does not count an owner while its live attachment link is unresolved", () => {
    const referencedOwner = "syncing-owner";
    const attachmentPath = `Stream/attachments/2026/08/${referencedOwner}/image--asset-id.jpg`;
    const liveSource = "Notes/syncing-gallery.md";
    const service = recoveryService(
      [attachmentPath],
      [liveSource],
      {},
      { [liveSource]: { [attachmentPath]: 1 } }
    );

    expect(service.scan(new Set(), 0, draft).orphanAttachmentCount).toBe(0);
  });
});
