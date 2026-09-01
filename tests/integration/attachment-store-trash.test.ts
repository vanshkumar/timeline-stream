import { type App, TFile, TFolder } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { AttachmentStore } from "../../src/storage/attachment-store";

const owner = {
  id: "01991f2f-0d36-7c6e-93a4-6a0a96d8596f",
  createdAt: "2026-08-30T01:45:12.347+00:00"
};
const ownerFolder = `Stream/attachments/2026/08/${owner.id}`;

function appWith(existing: TFile | TFolder | null) {
  const getAbstractFileByPath = vi.fn(() => existing);
  const trashFile = vi.fn(async () => undefined);
  const app = {
    vault: { getAbstractFileByPath },
    fileManager: { trashFile }
  } as unknown as App;
  return { app, getAbstractFileByPath, trashFile };
}

describe("AttachmentStore.trashOwnedBy", () => {
  it("moves the exact owner folder through Obsidian's trash behavior", async () => {
    const folder = Object.assign(new TFolder(), { path: ownerFolder });
    const { app, getAbstractFileByPath, trashFile } = appWith(folder);

    await expect(new AttachmentStore(app).trashOwnedBy(owner)).resolves.toBe("trashed");

    expect(getAbstractFileByPath).toHaveBeenCalledWith(ownerFolder);
    expect(trashFile).toHaveBeenCalledWith(folder);
  });

  it("treats an already-missing owner folder as a successful no-op", async () => {
    const { app, trashFile } = appWith(null);

    await expect(new AttachmentStore(app).trashOwnedBy(owner)).resolves.toBe("absent");
    expect(trashFile).not.toHaveBeenCalled();
  });

  it("refuses to trash a non-folder at the managed owner path", async () => {
    const file = Object.assign(new TFile(), { path: ownerFolder });
    const { app, trashFile } = appWith(file);

    await expect(new AttachmentStore(app).trashOwnedBy(owner)).rejects.toThrow("Expected an attachment folder");
    expect(trashFile).not.toHaveBeenCalled();
  });

  it("rejects unsafe owner metadata before looking up a destructive path", async () => {
    const { app, getAbstractFileByPath, trashFile } = appWith(null);

    await expect(new AttachmentStore(app).trashOwnedBy({ ...owner, id: "../../entries" })).rejects.toThrow(
      "unsafe identity"
    );
    expect(getAbstractFileByPath).not.toHaveBeenCalled();
    expect(trashFile).not.toHaveBeenCalled();
  });
});
