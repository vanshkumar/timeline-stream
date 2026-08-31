import { describe, expect, it, vi } from "vitest";
import type { DraftState, EntryIdentity, StoredAttachment } from "../../src/domain/entry";
import {
  appendGeneratedContent,
  ComposeRequestBridge,
  type ComposeRequest
} from "../../src/view/compose-request-bridge";

function draft(body = ""): DraftState {
  return {
    body,
    tags: [],
    attachments: [],
    phase: "draft",
    updatedAt: 10
  };
}

describe("appendGeneratedContent", () => {
  it("sets an empty draft body to the generated Markdown", () => {
    const original = draft();

    const result = appendGeneratedContent(original, "> Selected passage\n\n↗ [[Notes/Source|source]]", 20);

    expect(result.body).toBe("> Selected passage\n\n↗ [[Notes/Source|source]]");
    expect(result.updatedAt).toBe(20);
    expect(original.body).toBe("");
  });

  it("appends to an existing body with exactly two newline characters", () => {
    const result = appendGeneratedContent(
      draft("Existing draft"),
      "> Selected passage\n\n↗ [[Notes/Source|source]]",
      20
    );

    expect(result.body).toBe("Existing draft\n\n> Selected passage\n\n↗ [[Notes/Source|source]]");
  });

  it("preserves unrelated draft state while applying normal edit semantics", () => {
    const identity: EntryIdentity = {
      id: "01991f2f-0d36-7c6e-93a4-6a0a96d8596f",
      createdAt: "2026-08-30T01:45:12.347Z",
      notePath: "Stream/entries/2026/08/2026-08-30T01-45-12-347Z--01991f2f-0d36-7c6e-93a4-6a0a96d8596f.md",
      year: "2026",
      month: "08"
    };
    const tags = ["reflection", "feedback-loop"];
    const attachments: StoredAttachment[] = [{
      id: "asset-id",
      kind: "image",
      path: "Stream/attachments/2026/08/entry-id/image--asset-id.jpg",
      mimeType: "image/jpeg",
      size: 42
    }];
    const futureState = { editorMode: "expanded", revision: 3 };
    const original: DraftState & { futureState: typeof futureState } = {
      identity,
      body: "Existing draft",
      tags,
      attachments,
      phase: "error",
      error: "stale save failure",
      updatedAt: 10,
      futureState
    };

    const result = appendGeneratedContent(original, "Generated Markdown", 99);

    expect(result.identity).toBe(identity);
    expect(result.tags).toBe(tags);
    expect(result.attachments).toBe(attachments);
    expect((result as typeof original).futureState).toBe(futureState);
    expect(result).toMatchObject({
      body: "Existing draft\n\nGenerated Markdown",
      phase: "draft",
      updatedAt: 99
    });
    expect(result).not.toHaveProperty("error");
    expect(original).toMatchObject({ phase: "error", error: "stale save failure", updatedAt: 10 });
  });
});

describe("ComposeRequestBridge", () => {
  it("delivers requests queued before subscription in FIFO order", () => {
    const bridge = new ComposeRequestBridge();
    const first = bridge.request("first");
    const second = bridge.request("second");
    const processed: ComposeRequest[] = [];
    const listener = vi.fn(() => {
      processed.push(...bridge.drain());
    });

    const unsubscribe = bridge.subscribe(listener);

    expect(listener).toHaveBeenCalledOnce();
    expect(processed).toEqual([first, second]);
    expect(processed.map((request) => request.id)).toEqual([1, 2]);
    expect(bridge.drain()).toEqual([]);
    unsubscribe();
  });

  it("processes every repeated request exactly once without replaying drained requests", () => {
    const bridge = new ComposeRequestBridge();
    const processed: ComposeRequest[] = [];
    const listener = vi.fn(() => {
      processed.push(...bridge.drain());
    });
    const unsubscribe = bridge.subscribe(listener);

    const first = bridge.request("same generated Markdown");
    const second = bridge.request("same generated Markdown");
    const third = bridge.request("different generated Markdown");

    expect(listener).toHaveBeenCalledTimes(3);
    expect(processed).toEqual([first, second, third]);
    expect(bridge.drain()).toEqual([]);

    unsubscribe();
    const replacementListener = vi.fn(() => {
      processed.push(...bridge.drain());
    });
    const unsubscribeReplacement = bridge.subscribe(replacementListener);

    expect(replacementListener).not.toHaveBeenCalled();

    const fourth = bridge.request("after re-subscription");

    expect(listener).toHaveBeenCalledTimes(3);
    expect(replacementListener).toHaveBeenCalledOnce();
    expect(processed).toEqual([first, second, third, fourth]);
    expect(processed.map((request) => request.id)).toEqual([1, 2, 3, 4]);
    expect(new Set(processed.map((request) => request.id)).size).toBe(4);
    expect(bridge.drain()).toEqual([]);
    unsubscribeReplacement();
  });
});
