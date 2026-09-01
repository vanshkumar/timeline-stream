import { describe, expect, it } from "vitest";
import {
  attachmentFolderForEntry,
  attachmentOwnerIdFromPath,
  decideAttachmentCleanup,
  hasLiveResolvedReference,
  referencedAttachmentOwnerIds,
  referencesAttachmentFolder
} from "../../src/domain/attachment-lifecycle";

const owner = {
  id: "01991f2f-0d36-7c6e-93a4-6a0a96d8596f",
  createdAt: "2026-08-29T18:45:12.347-07:00"
};
const ownerFolder = `Stream/attachments/2026/08/${owner.id}`;

describe("attachment lifecycle paths", () => {
  it("derives the exact managed folder for a safe entry owner", () => {
    expect(attachmentFolderForEntry(owner)).toBe(ownerFolder);
  });

  it.each([
    "",
    ".",
    "..",
    "../entries",
    "entry/id",
    "entry id",
    "x".repeat(129)
  ])("refuses an unsafe owner id: %s", (id) => {
    expect(attachmentFolderForEntry({ ...owner, id })).toBeNull();
  });

  it("refuses an invalid entry timestamp", () => {
    expect(attachmentFolderForEntry({ ...owner, createdAt: "not-a-timestamp" })).toBeNull();
  });

  it("recognizes owners only beneath the exact managed attachment prefix", () => {
    const attachmentPath = `${ownerFolder}/image--asset-id.jpg`;

    expect(attachmentOwnerIdFromPath(attachmentPath)).toBe(owner.id);
    expect(attachmentOwnerIdFromPath(`Archive/${attachmentPath}`)).toBeNull();
    expect(attachmentOwnerIdFromPath(`Stream/attachments-backup/2026/08/${owner.id}/image.jpg`)).toBeNull();
    expect(attachmentOwnerIdFromPath(`Stream/attachments/2026/13/${owner.id}/image.jpg`)).toBeNull();
    expect(attachmentOwnerIdFromPath("Stream/attachments/2026/08/../image.jpg")).toBeNull();
  });
});

describe("attachment cleanup decisions", () => {
  it("retains an owner folder while another same-id entry survives", () => {
    expect(decideAttachmentCleanup(owner.id, ownerFolder, [
      { id: owner.id, raw: "No attachment embed is required for same-id ownership." }
    ])).toBe("retain-same-id");
  });

  it("retains an owner folder while a different live entry references it", () => {
    expect(decideAttachmentCleanup(owner.id, ownerFolder, [
      { id: "duplicate-entry", raw: `![[${ownerFolder}/image--asset-id.jpg]]` }
    ])).toBe("retain-reference");
  });

  it("trashes an unreferenced folder and does not confuse lookalike owner prefixes", () => {
    expect(decideAttachmentCleanup(owner.id, ownerFolder, [
      { id: "unrelated-entry", raw: `![[${ownerFolder}-copy/image--asset-id.jpg]]` }
    ])).toBe("trash");
  });

  it("matches a folder reference only across its slash boundary", () => {
    expect(referencesAttachmentFolder(`![[${ownerFolder}/image--asset-id.jpg]]`, ownerFolder)).toBe(true);
    expect(referencesAttachmentFolder(`![[${ownerFolder}-copy/image--asset-id.jpg]]`, ownerFolder)).toBe(false);
    expect(referencesAttachmentFolder(`The folder is ${ownerFolder}`, ownerFolder)).toBe(false);
  });
});

describe("resolved attachment references", () => {
  const liveSource = "Stream/entries/2026/08/live.md";
  const deletedSource = "Stream/entries/2026/08/deleted.md";

  it("accepts only an exact descendant target from a live source", () => {
    const liveSources = new Set([liveSource]);

    expect(hasLiveResolvedReference(ownerFolder, liveSources, {
      [liveSource]: { [`${ownerFolder}/image--asset-id.jpg`]: 1 }
    })).toBe(true);
    expect(hasLiveResolvedReference(ownerFolder, liveSources, {
      [liveSource]: { [`${ownerFolder}-copy/image--asset-id.jpg`]: 1 },
      [deletedSource]: { [`${ownerFolder}/image--asset-id.jpg`]: 1 }
    })).toBe(false);
  });

  it("collects managed owner ids referenced by live notes only", () => {
    const otherOwner = "01991f30-1111-7aaa-8bbb-222222222222";
    const ownerIds = referencedAttachmentOwnerIds(new Set([liveSource]), {
      [liveSource]: {
        [`${ownerFolder}/image--asset-id.jpg`]: 1,
        [`Archive/${ownerFolder}/not-managed.jpg`]: 1,
        "Stream/attachments-backup/2026/08/backup-owner/not-managed.jpg": 1
      },
      [deletedSource]: {
        [`Stream/attachments/2026/08/${otherOwner}/audio--asset-id.m4a`]: 1
      }
    });

    expect(ownerIds).toEqual(new Set([owner.id]));
  });
});
