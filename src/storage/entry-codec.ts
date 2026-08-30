import { parse, stringify } from "yaml";
import {
  STREAM_SCHEMA_VERSION,
  type EntryIdentity,
  type ParsedEntry,
  type StreamEntryMetadata
} from "../domain/entry";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export class InvalidEntryError extends Error {}
export class StaleEntryError extends Error {}

export interface EncodeEntryOptions {
  identity: EntryIdentity;
  body: string;
  tags?: string[];
  duplicatedFrom?: string;
  userFrontmatter?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  return [...new Set(values.map((tag) => String(tag).replace(/^#/, "").trim()).filter(Boolean))];
}

export class EntryCodec {
  parse(path: string, raw: string): ParsedEntry {
    const match = FRONTMATTER_PATTERN.exec(raw);
    if (!match) {
      throw new InvalidEntryError(`${path} has no YAML frontmatter.`);
    }

    const rawFrontmatter = match[1] ?? "";
    const parsed = parse(rawFrontmatter) as unknown;
    if (!isRecord(parsed)) {
      throw new InvalidEntryError(`${path} has invalid YAML frontmatter.`);
    }

    const schema = parsed.stream_schema;
    const id = parsed.stream_id;
    const createdAt = parsed.stream_created_at;
    if (schema !== STREAM_SCHEMA_VERSION || typeof id !== "string" || typeof createdAt !== "string") {
      throw new InvalidEntryError(`${path} is missing valid stream identity fields.`);
    }

    const timestamp = Date.parse(createdAt);
    if (!Number.isFinite(timestamp)) {
      throw new InvalidEntryError(`${path} has an invalid stream_created_at value.`);
    }

    const metadata = {
      ...parsed,
      stream_schema: schema,
      stream_id: id,
      stream_created_at: createdAt,
      ...(normalizeTags(parsed.tags).length > 0 ? { tags: normalizeTags(parsed.tags) } : {})
    } as StreamEntryMetadata;

    return {
      path,
      raw,
      rawFrontmatter,
      metadata,
      body: raw.slice(match[0].length).replace(/^\r?\n/, "")
    };
  }

  encode(options: EncodeEntryOptions): string {
    const metadata: Record<string, unknown> = {
      ...(options.userFrontmatter ?? {}),
      stream_schema: STREAM_SCHEMA_VERSION,
      stream_id: options.identity.id,
      stream_created_at: options.identity.createdAt
    };

    const tags = normalizeTags(options.tags);
    if (tags.length > 0) {
      metadata.tags = tags;
    } else {
      delete metadata.tags;
    }

    if (options.duplicatedFrom) {
      metadata.stream_duplicated_from = options.duplicatedFrom;
    } else {
      delete metadata.stream_duplicated_from;
    }

    const yaml = stringify(metadata, {
      defaultKeyType: "PLAIN",
      defaultStringType: "QUOTE_DOUBLE",
      lineWidth: 0
    }).trimEnd();
    const body = options.body.trim();
    return `---\n${yaml}\n---\n\n${body}${body ? "\n" : ""}`;
  }

  replaceBody(raw: string, nextBody: string): string {
    const match = FRONTMATTER_PATTERN.exec(raw);
    if (!match) {
      throw new InvalidEntryError("Cannot edit an entry without YAML frontmatter.");
    }
    const body = nextBody.trim();
    return `${raw.slice(0, match[0].length)}\n${body}${body ? "\n" : ""}`;
  }

  replaceBodyIfUnchanged(current: string, baseline: string, nextBody: string): string {
    if (current !== baseline) {
      throw new StaleEntryError("This entry changed after editing began.");
    }
    return this.replaceBody(current, nextBody);
  }
}
