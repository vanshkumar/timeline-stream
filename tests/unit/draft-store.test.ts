import { describe, expect, it } from "vitest";
import { createEntryIdentity } from "../../src/domain/identity";
import { DraftStore, type KeyValueStorage } from "../../src/storage/draft-store";

class MemoryStorage implements KeyValueStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe("DraftStore", () => {
  it("round-trips a pending send without storing attachment bytes", () => {
    const storage = new MemoryStorage();
    const drafts = new DraftStore("Private Vault", storage);
    const identity = createEntryIdentity(new Date("2026-08-30T01:45:12.347Z"), "01991f2f-0d36-7c6e-93a4-6a0a96d8596f");
    drafts.save({
      identity,
      body: "Unsent text",
      tags: ["idea"],
      attachments: [{ id: "asset", kind: "image", path: "Stream/attachments/image.jpg", mimeType: "image/jpeg", size: 42 }],
      phase: "committing",
      updatedAt: 123
    });
    expect(drafts.load()).toMatchObject({ identity, body: "Unsent text", phase: "committing" });
    drafts.clear();
    expect(drafts.load().body).toBe("");
  });
});
