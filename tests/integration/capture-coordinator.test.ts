import { describe, expect, it, vi } from "vitest";
import { CaptureCoordinator } from "../../src/capture/capture-coordinator";
import { createEntryIdentity } from "../../src/domain/identity";
import type { CommitRequest, DraftState, ParsedEntry } from "../../src/domain/entry";

function request(): CommitRequest {
  return {
    identity: createEntryIdentity(new Date("2026-08-30T01:45:12.347Z"), "01991f2f-0d36-7c6e-93a4-6a0a96d8596f"),
    body: "Durable thought",
    tags: [],
    attachments: []
  };
}

function parsedEntry(input: CommitRequest): ParsedEntry {
  return {
    path: input.identity.notePath,
    raw: "raw",
    rawFrontmatter: "frontmatter",
    metadata: {
      stream_schema: 1,
      stream_id: input.identity.id,
      stream_created_at: input.identity.createdAt
    },
    body: input.body
  };
}

describe("CaptureCoordinator", () => {
  it("verifies assets, commits once, and clears recovery state", async () => {
    const input = request();
    const save = vi.fn<(draft: DraftState) => void>();
    const clear = vi.fn<() => void>();
    const verifyAll = vi.fn(async () => undefined);
    const commit = vi.fn(async () => parsedEntry(input));
    const coordinator = new CaptureCoordinator({ commit }, { verifyAll }, { save, clear });

    await expect(coordinator.submit(input)).resolves.toMatchObject({ path: input.identity.notePath });
    expect(verifyAll).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ phase: "committing" }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it("preserves a recoverable error when attachment verification or note creation fails", async () => {
    const input = request();
    const saved: DraftState[] = [];
    const coordinator = new CaptureCoordinator(
      { commit: vi.fn(async () => parsedEntry(input)) },
      { verifyAll: vi.fn(async () => { throw new Error("missing media"); }) },
      { save: (draft) => saved.push(draft), clear: vi.fn() }
    );

    await expect(coordinator.submit(input)).rejects.toThrow("missing media");
    expect(saved.at(-1)).toMatchObject({ phase: "error", error: "missing media", identity: input.identity });
  });

  it("retries the same stable request after note creation fails", async () => {
    const input = request();
    let attempt = 0;
    const commit = vi.fn(async (received: CommitRequest) => {
      attempt += 1;
      if (attempt === 1) throw new Error("note create failed");
      return parsedEntry(received);
    });
    const save = vi.fn<(draft: DraftState) => void>();
    const clear = vi.fn<() => void>();
    const coordinator = new CaptureCoordinator(
      { commit },
      { verifyAll: vi.fn(async () => undefined) },
      { save, clear }
    );

    await expect(coordinator.submit(input)).rejects.toThrow("note create failed");
    await expect(coordinator.submit(input)).resolves.toMatchObject({ path: input.identity.notePath });
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[0]?.[0].identity).toEqual(commit.mock.calls[1]?.[0].identity);
    expect(clear).toHaveBeenCalledOnce();
  });
});
