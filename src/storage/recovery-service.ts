import type { Vault } from "obsidian";
import { ATTACHMENT_ROOT, type DraftState } from "../domain/entry";

export interface RecoveryReport {
  pendingDraft: boolean;
  orphanAttachmentCount: number;
  malformedEntryCount: number;
}

export class RecoveryService {
  constructor(private readonly vault: Vault) {}

  scan(entryIds: Set<string>, malformedEntryCount: number, draft: DraftState): RecoveryReport {
    const ownerIds = new Set<string>();
    for (const file of this.vault.getFiles()) {
      if (!file.path.startsWith(`${ATTACHMENT_ROOT}/`)) {
        continue;
      }
      const ownerId = file.path.split("/")[4];
      if (ownerId && !entryIds.has(ownerId)) {
        ownerIds.add(ownerId);
      }
    }
    return {
      pendingDraft: draft.phase === "committing" || draft.phase === "error",
      orphanAttachmentCount: ownerIds.size,
      malformedEntryCount
    };
  }
}
