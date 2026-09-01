import { ATTACHMENT_ROOT, type EntryIdentity } from "./entry";
import { filenameTimestamp } from "./identity";

export type AttachmentCleanupDecision = "trash" | "retain-same-id" | "retain-reference";

export interface AttachmentConsumerSnapshot {
  id?: string;
  raw: string;
}

type AttachmentOwner = Pick<EntryIdentity, "id" | "createdAt">;
type ResolvedLinks = Readonly<Record<string, Readonly<Record<string, number>>>>;

const SAFE_PATH_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

function isSafePathSegment(value: string): boolean {
  return SAFE_PATH_SEGMENT.test(value) && value !== "." && value !== "..";
}

export function attachmentFolderForEntry(owner: AttachmentOwner): string | null {
  if (!isSafePathSegment(owner.id)) return null;
  try {
    filenameTimestamp(owner.createdAt);
  } catch {
    return null;
  }
  return `${ATTACHMENT_ROOT}/${owner.createdAt.slice(0, 4)}/${owner.createdAt.slice(5, 7)}/${owner.id}`;
}

export function attachmentOwnerIdFromPath(path: string): string | null {
  const segments = path.split("/");
  if (
    segments.length < 6 ||
    segments[0] !== "Stream" ||
    segments[1] !== "attachments" ||
    !/^\d{4}$/.test(segments[2] ?? "") ||
    !/^(?:0[1-9]|1[0-2])$/.test(segments[3] ?? "") ||
    !isSafePathSegment(segments[4] ?? "")
  ) {
    return null;
  }
  return segments[4] ?? null;
}

export function referencesAttachmentFolder(raw: string, folder: string): boolean {
  return raw.includes(`${folder}/`);
}

export function decideAttachmentCleanup(
  ownerId: string,
  ownerFolder: string,
  survivors: readonly AttachmentConsumerSnapshot[]
): AttachmentCleanupDecision {
  if (survivors.some((entry) => entry.id === ownerId)) return "retain-same-id";
  if (survivors.some((entry) => referencesAttachmentFolder(entry.raw, ownerFolder))) return "retain-reference";
  return "trash";
}

export function hasLiveResolvedReference(
  folder: string,
  liveSourcePaths: ReadonlySet<string>,
  resolvedLinks: ResolvedLinks
): boolean {
  const prefix = `${folder}/`;
  return Object.entries(resolvedLinks).some(([sourcePath, targets]) =>
    liveSourcePaths.has(sourcePath) && Object.keys(targets).some((targetPath) => targetPath.startsWith(prefix))
  );
}

export function referencedAttachmentOwnerIds(
  liveSourcePaths: ReadonlySet<string>,
  resolvedLinks: ResolvedLinks
): Set<string> {
  const ownerIds = new Set<string>();
  for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
    if (!liveSourcePaths.has(sourcePath)) continue;
    for (const targetPath of Object.keys(targets)) {
      const ownerId = attachmentOwnerIdFromPath(targetPath);
      if (ownerId) ownerIds.add(ownerId);
    }
  }
  return ownerIds;
}
