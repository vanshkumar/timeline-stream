import type { EntrySummary } from "../domain/entry";
import type { StreamRepository } from "../storage/stream-repository";

interface SearchCacheValue {
  mtime: number;
  text: string;
}

export class SearchService {
  private readonly cache = new Map<string, SearchCacheValue>();

  constructor(private readonly repository: Pick<StreamRepository, "readBody">) {}

  async search(entries: EntrySummary[], query: string, signal?: AbortSignal): Promise<Set<string>> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return new Set(entries.map((entry) => entry.path));

    const matches = new Set<string>();
    for (let index = 0; index < entries.length; index += 25) {
      if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
      const batch = entries.slice(index, index + 25);
      await Promise.all(
        batch.map(async (entry) => {
          let cached = this.cache.get(entry.path);
          if (!cached || cached.mtime !== entry.mtime) {
            const body = await this.repository.readBody(entry.path);
            cached = { mtime: entry.mtime, text: body.toLocaleLowerCase() };
            this.cache.set(entry.path, cached);
          }
          if (cached.text.includes(normalized)) matches.add(entry.path);
        })
      );
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    }
    return matches;
  }

  clear(path?: string): void {
    if (path) this.cache.delete(path);
    else this.cache.clear();
  }
}
