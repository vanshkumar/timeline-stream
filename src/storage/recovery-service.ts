import type { MetadataCache, Vault } from "obsidian";
import { attachmentOwnerIdFromPath, referencedAttachmentOwnerIds } from "../domain/attachment-lifecycle";
import type { DraftState } from "../domain/entry";

export interface RecoveryReport {
  pendingDraft: boolean;
  orphanAttachmentCount: number;
  malformedEntryCount: number;
}

export class RecoveryService {
  constructor(
    private readonly vault: Vault,
    private readonly metadataCache: MetadataCache
  ) {}

  scan(entryIds: Set<string>, malformedEntryCount: number, draft: DraftState): RecoveryReport {
    const liveSourcePaths = new Set(
      this.vault.getMarkdownFiles()
        .map((file) => file.path)
        .filter((path) => !path.startsWith(".trash/"))
    );
    const liveOwnerIds = new Set(entryIds);
    for (const links of [this.metadataCache.resolvedLinks, this.metadataCache.unresolvedLinks ?? {}]) {
      for (const ownerId of referencedAttachmentOwnerIds(liveSourcePaths, links)) {
        liveOwnerIds.add(ownerId);
      }
    }

    const ownerIds = new Set<string>();
    for (const file of this.vault.getFiles()) {
      const ownerId = attachmentOwnerIdFromPath(file.path);
      if (ownerId && !liveOwnerIds.has(ownerId)) {
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
