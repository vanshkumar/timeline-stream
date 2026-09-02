import { describe, expect, it, vi } from "vitest";
import type { ParsedEntry } from "../../src/domain/entry";
import {
  beginTimelineRefresh,
  summaryFromCommittedEntry
} from "../../src/view/post-flow";

const committed: ParsedEntry = {
  path: "Stream/entries/2026/09/committed.md",
  raw: "raw",
  rawFrontmatter: "frontmatter",
  metadata: {
    stream_schema: 1,
    stream_id: "committed-id",
    stream_created_at: "2026-09-02T10:00:00.000-07:00",
    tags: ["photo", "photo"]
  },
  body: "![[Stream/attachments/photo.jpg]]"
};

describe("post flow", () => {
  it("builds a normalized index summary from the committed entry", () => {
    expect(summaryFromCommittedEntry(committed, 42)).toEqual({
      path: committed.path,
      id: committed.metadata.stream_id,
      createdAt: committed.metadata.stream_created_at,
      tags: ["photo"],
      mtime: 42,
      conflict: "none",
      duplicateCount: 1
    });
  });

  it("starts reconciliation without waiting for a stalled index rebuild", () => {
    const rebuild = vi.fn(() => new Promise<void>(() => undefined));

    expect(beginTimelineRefresh({ rebuild }, vi.fn())).toBeUndefined();
    expect(rebuild).toHaveBeenCalledWith("create");
  });

  it("reports a background reconciliation failure", async () => {
    const failure = new Error("cache read failed");
    const onError = vi.fn();

    beginTimelineRefresh({ rebuild: vi.fn(async () => { throw failure; }) }, onError);

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
  });
});
