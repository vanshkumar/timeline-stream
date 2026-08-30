import { describe, expect, it } from "vitest";
import { createAttachmentPath, createEntryIdentity, filenameTimestamp, formatRfc3339, uuidv7 } from "../../src/domain/identity";

describe("stream identity", () => {
  it("creates a standards-shaped UUIDv7 with timestamp, version, and variant bits", () => {
    const id = uuidv7(1_725_000_000_123, (bytes) => bytes.fill(0xaa));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id).toBe(uuidv7(1_725_000_000_123, (bytes) => bytes.fill(0xaa)));
  });

  it("uses an offset-preserving, colon-free path", () => {
    const date = new Date("2026-08-30T01:45:12.347Z");
    const createdAt = formatRfc3339(date, -7 * 60);
    expect(createdAt).toBe("2026-08-29T18:45:12.347-07:00");
    expect(filenameTimestamp(createdAt)).toBe("20260829T184512.347-0700");

    const identity = createEntryIdentity(date, "01991f2f-0d36-7c6e-93a4-6a0a96d8596f");
    expect(identity.notePath).toContain("Stream/entries/");
    expect(identity.notePath).not.toContain(":");
  });

  it("creates unique deterministic attachment locations beneath the owning entry", () => {
    const identity = {
      id: "entry-id",
      createdAt: "2026-08-29T18:45:12.347-07:00",
      notePath: "Stream/entries/2026/08/note.md",
      year: "2026",
      month: "08"
    };
    expect(createAttachmentPath(identity, "image", ".JPG", "asset-id")).toEqual({
      id: "asset-id",
      path: "Stream/attachments/2026/08/entry-id/image--asset-id.jpg"
    });
  });
});
