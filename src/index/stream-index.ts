import { MetadataCache, Plugin, TFile, type EventRef, type Vault } from "obsidian";
import { ENTRY_ROOT, STREAM_SCHEMA_VERSION, type EntrySummary } from "../domain/entry";
import { groupIdentityVariants } from "../domain/groups";
import { normalizeTags, EntryCodec } from "../storage/entry-codec";

export type IndexChangeReason = "rebuild" | "create" | "change";
export type IndexListener = (reason: IndexChangeReason) => void;

interface ProvisionalEntry {
  file: TFile;
  summary: EntrySummary;
}

interface Variant extends ProvisionalEntry {
  id: string;
  path: string;
  raw: string;
}

function isEntryPath(path: string): boolean {
  return path.startsWith(`${ENTRY_ROOT}/`) && path.toLowerCase().endsWith(".md");
}

function inlineTags(cache: ReturnType<MetadataCache["getFileCache"]>): string[] {
  return cache?.tags?.map((tag) => tag.tag.replace(/^#/, "")) ?? [];
}

export class StreamIndex {
  private summaries: EntrySummary[] = [];
  private readonly listeners = new Set<IndexListener>();
  private rebuildTimer: number | null = null;
  private queuedReason: IndexChangeReason = "change";
  malformedEntryCount = 0;

  constructor(
    private readonly vault: Vault,
    private readonly metadataCache: MetadataCache,
    private readonly codec: EntryCodec
  ) {}

  getEntries(): EntrySummary[] {
    return this.summaries;
  }

  getEntryIds(): Set<string> {
    return new Set(this.summaries.map((entry) => entry.id));
  }

  subscribe(listener: IndexListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(plugin: Plugin): void {
    const refs: EventRef[] = [
      this.vault.on("create", (file) => {
        if (file instanceof TFile && isEntryPath(file.path)) this.schedule("create");
      }),
      this.vault.on("modify", (file) => {
        if (file instanceof TFile && isEntryPath(file.path)) this.schedule("change");
      }),
      this.vault.on("delete", (file) => {
        if (isEntryPath(file.path)) this.schedule("change");
      }),
      this.vault.on("rename", (file, oldPath) => {
        if (isEntryPath(file.path) || isEntryPath(oldPath)) this.schedule("change");
      }),
      this.metadataCache.on("changed", (file) => {
        if (isEntryPath(file.path)) this.schedule("change");
      })
    ];
    refs.forEach((ref) => plugin.registerEvent(ref));
    plugin.register(() => {
      if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    });
  }

  async rebuild(reason: IndexChangeReason = "rebuild"): Promise<void> {
    if (this.rebuildTimer !== null) {
      window.clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
      this.queuedReason = "change";
    }
    const provisional: ProvisionalEntry[] = [];
    let malformed = 0;

    for (const file of this.vault.getMarkdownFiles()) {
      if (!isEntryPath(file.path)) continue;
      try {
        const summary = await this.summaryFor(file);
        provisional.push({ file, summary });
      } catch {
        malformed += 1;
      }
    }

    const byId = new Map<string, ProvisionalEntry[]>();
    for (const item of provisional) {
      const variants = byId.get(item.summary.id) ?? [];
      variants.push(item);
      byId.set(item.summary.id, variants);
    }

    const resolved: EntrySummary[] = [];
    for (const variants of byId.values()) {
      if (variants.length === 1) {
        resolved.push(variants[0]!.summary);
        continue;
      }
      const withContent: Variant[] = await Promise.all(
        variants.map(async (variant) => ({
          ...variant,
          id: variant.summary.id,
          path: variant.summary.path,
          raw: await this.vault.cachedRead(variant.file)
        }))
      );
      for (const grouped of groupIdentityVariants(withContent)) {
        if (!grouped.visible) continue;
        resolved.push({
          ...grouped.item.summary,
          conflict: grouped.conflict,
          duplicateCount: grouped.duplicateCount
        });
      }
    }

    resolved.sort((left, right) => {
      const byTime = Date.parse(left.createdAt) - Date.parse(right.createdAt);
      return byTime || left.id.localeCompare(right.id) || left.path.localeCompare(right.path);
    });
    this.summaries = resolved;
    this.malformedEntryCount = malformed;
    this.listeners.forEach((listener) => listener(reason));
  }

  private async summaryFor(file: TFile): Promise<EntrySummary> {
    const cache = this.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (
      frontmatter?.stream_schema === STREAM_SCHEMA_VERSION &&
      typeof frontmatter.stream_id === "string" &&
      typeof frontmatter.stream_created_at === "string" &&
      Number.isFinite(Date.parse(frontmatter.stream_created_at))
    ) {
      return {
        path: file.path,
        id: frontmatter.stream_id,
        createdAt: frontmatter.stream_created_at,
        tags: [...new Set([...normalizeTags(frontmatter.tags), ...inlineTags(cache)])],
        mtime: file.stat.mtime,
        conflict: "none",
        duplicateCount: 1
      };
    }

    const parsed = this.codec.parse(file.path, await this.vault.cachedRead(file));
    return {
      path: file.path,
      id: parsed.metadata.stream_id,
      createdAt: parsed.metadata.stream_created_at,
      tags: [...new Set([...normalizeTags(parsed.metadata.tags), ...inlineTags(cache)])],
      mtime: file.stat.mtime,
      conflict: "none",
      duplicateCount: 1
    };
  }

  private schedule(reason: IndexChangeReason): void {
    if (reason === "create") this.queuedReason = "create";
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      const queued = this.queuedReason;
      this.queuedReason = "change";
      void this.rebuild(queued);
    }, 120);
  }
}
