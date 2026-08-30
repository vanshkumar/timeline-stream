export const STREAM_ROOT = "Stream";
export const ENTRY_ROOT = `${STREAM_ROOT}/entries`;
export const ATTACHMENT_ROOT = `${STREAM_ROOT}/attachments`;
export const STREAM_SCHEMA_VERSION = 1;
export const PAGE_SIZE = 30;

export type AttachmentKind = "image" | "audio";

export interface EntryIdentity {
  id: string;
  createdAt: string;
  notePath: string;
  year: string;
  month: string;
}

export interface StoredAttachment {
  id: string;
  kind: AttachmentKind;
  path: string;
  mimeType: string;
  size: number;
}

export interface StreamEntryMetadata extends Record<string, unknown> {
  stream_schema: number;
  stream_id: string;
  stream_created_at: string;
  tags?: string[];
  stream_duplicated_from?: string;
}

export interface ParsedEntry {
  path: string;
  raw: string;
  rawFrontmatter: string;
  metadata: StreamEntryMetadata;
  body: string;
}

export type ConflictState = "none" | "identical" | "divergent";

export interface EntrySummary {
  path: string;
  id: string;
  createdAt: string;
  tags: string[];
  mtime: number;
  conflict: ConflictState;
  duplicateCount: number;
}

export type DraftPhase = "draft" | "committing" | "error";

export interface DraftState {
  identity?: EntryIdentity;
  body: string;
  tags: string[];
  attachments: StoredAttachment[];
  phase: DraftPhase;
  error?: string;
  updatedAt: number;
}

export interface CommitRequest {
  identity: EntryIdentity;
  body: string;
  tags: string[];
  attachments: StoredAttachment[];
}

export function emptyDraft(): DraftState {
  return {
    body: "",
    tags: [],
    attachments: [],
    phase: "draft",
    updatedAt: Date.now()
  };
}
