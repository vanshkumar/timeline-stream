import type { EntrySummary, ParsedEntry } from "../domain/entry";
import type { StreamIndex } from "../index/stream-index";
import { normalizeTags } from "../storage/entry-codec";

export function summaryFromCommittedEntry(entry: ParsedEntry, mtime: number): EntrySummary {
  return {
    path: entry.path,
    id: entry.metadata.stream_id,
    createdAt: entry.metadata.stream_created_at,
    tags: normalizeTags(entry.metadata.tags),
    mtime,
    conflict: "none",
    duplicateCount: 1
  };
}

export function beginTimelineRefresh(
  index: Pick<StreamIndex, "rebuild">,
  onError: (error: unknown) => void
): void {
  void index.rebuild("create").catch(onError);
}
