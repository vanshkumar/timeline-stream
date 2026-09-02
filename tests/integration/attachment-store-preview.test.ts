import { type App, TFile, TFolder } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { createEntryIdentity } from "../../src/domain/identity";
import { AttachmentStore } from "../../src/storage/attachment-store";

describe("AttachmentStore resource paths", () => {
  it("previews a newly created file before the vault lookup cache catches up", async () => {
    const createdFile = new TFile();
    let cachedFile: TFile | null = null;
    const getAbstractFileByPath = vi.fn((path: string) => {
      if (path.endsWith(".jpg")) return cachedFile;
      return Object.assign(new TFolder(), { path });
    });
    const createBinary = vi.fn(async (path: string, data: ArrayBuffer) => {
      Object.assign(createdFile, { path, stat: { ctime: 0, mtime: 0, size: data.byteLength } });
      return createdFile;
    });
    const getResourcePath = vi.fn((file: TFile) =>
      `app://local/${file === createdFile ? "fresh" : "cached"}/${file.path}`
    );
    const app = {
      vault: { getAbstractFileByPath, createBinary, getResourcePath }
    } as unknown as App;
    const store = new AttachmentStore(app);
    const identity = createEntryIdentity(
      new Date("2026-09-02T12:34:56.789Z"),
      "01991f2f-0d36-7c6e-93a4-6a0a96d8596f"
    );

    const attachment = await store.writeFile(
      identity,
      "image",
      new Blob(["photo"], { type: "image/jpeg" }),
      "camera.jpg"
    );

    expect(getAbstractFileByPath(attachment.path)).toBeNull();
    await expect(store.verifyAll([attachment])).resolves.toBeUndefined();
    expect(store.resourcePath(attachment.path)).toBe(`app://local/fresh/${attachment.path}`);
    expect(getResourcePath).toHaveBeenCalledWith(createdFile);
    store.releaseFresh([attachment]);
    expect(store.resourcePath(attachment.path)).toBeNull();

    cachedFile = Object.assign(new TFile(), { path: attachment.path, stat: createdFile.stat });
    expect(store.resourcePath(attachment.path)).toBe(`app://local/cached/${attachment.path}`);
    cachedFile = null;
    expect(store.resourcePath(attachment.path)).toBeNull();
  });
});
