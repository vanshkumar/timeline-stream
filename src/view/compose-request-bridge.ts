import type { DraftState } from "../domain/entry";

export interface ComposeRequest {
  readonly id: number;
  readonly markdown: string;
}

export class ComposeRequestBridge {
  private nextId = 1;
  private pending: ComposeRequest[] = [];
  private listener: (() => void) | null = null;

  request(markdown: string): ComposeRequest {
    const request = { id: this.nextId, markdown };
    this.nextId += 1;
    this.pending.push(request);
    this.listener?.();
    return request;
  }

  drain(): ComposeRequest[] {
    return this.pending.splice(0);
  }

  subscribe(listener: () => void): () => void {
    if (this.listener) {
      throw new Error("The compose request bridge already has a subscriber.");
    }
    this.listener = listener;
    if (this.pending.length > 0) listener();
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }
}

export function appendGeneratedContent(
  draft: DraftState,
  generated: string,
  updatedAt = Date.now()
): DraftState {
  const next = {
    ...draft,
    body: draft.body.length === 0 ? generated : `${draft.body}\n\n${generated}`,
    phase: "draft" as const,
    updatedAt
  };
  delete next.error;
  return next;
}
