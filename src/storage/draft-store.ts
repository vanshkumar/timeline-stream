import type { DraftState } from "../domain/entry";
import { emptyDraft } from "../domain/entry";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class DraftStore {
  private readonly key: string;

  constructor(
    vaultName: string,
    private readonly storage: KeyValueStorage = window.localStorage
  ) {
    this.key = `personal-stream:${vaultName}:draft:v1`;
  }

  load(): DraftState {
    const value = this.storage.getItem(this.key);
    if (!value) {
      return emptyDraft();
    }
    try {
      const parsed = JSON.parse(value) as Partial<DraftState>;
      if (typeof parsed.body !== "string" || !Array.isArray(parsed.tags) || !Array.isArray(parsed.attachments)) {
        throw new Error("Invalid draft state");
      }
      return {
        body: parsed.body,
        tags: parsed.tags.map(String),
        attachments: parsed.attachments,
        phase: parsed.phase === "committing" || parsed.phase === "error" ? parsed.phase : "draft",
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
        ...(parsed.identity ? { identity: parsed.identity } : {}),
        ...(typeof parsed.error === "string" ? { error: parsed.error } : {})
      };
    } catch {
      return emptyDraft();
    }
  }

  save(draft: DraftState): void {
    this.storage.setItem(this.key, JSON.stringify(draft));
  }

  clear(): void {
    this.storage.removeItem(this.key);
  }
}

export type DraftPersistence = Pick<DraftStore, "save" | "clear">;
