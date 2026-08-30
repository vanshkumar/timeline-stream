import { ATTACHMENT_ROOT, ENTRY_ROOT, type AttachmentKind, type EntryIdentity } from "./entry";

type RandomSource = (target: Uint8Array) => Uint8Array;

function defaultRandomSource(target: Uint8Array): Uint8Array {
  return globalThis.crypto.getRandomValues(target);
}

export function uuidv7(now = Date.now(), randomSource: RandomSource = defaultRandomSource): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) {
    throw new RangeError("UUIDv7 timestamp must fit in 48 bits.");
  }

  const bytes = randomSource(new Uint8Array(16));
  let timestamp = BigInt(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }

  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, "0");
}

export function formatRfc3339(date: Date, offsetMinutes = -date.getTimezoneOffset()): string {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainder = absoluteOffset % 60;

  return [
    `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}.${pad(shifted.getUTCMilliseconds(), 3)}`,
    `${sign}${pad(offsetHours)}:${pad(offsetRemainder)}`
  ].join("");
}

export function filenameTimestamp(createdAt: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})([+-])(\d{2}):(\d{2})$/.exec(createdAt);
  if (!match) {
    throw new Error(`Invalid stream timestamp: ${createdAt}`);
  }
  const [, year, month, day, hour, minute, second, milliseconds, sign, offsetHour, offsetMinute] = match;
  return `${year}${month}${day}T${hour}${minute}${second}.${milliseconds}${sign}${offsetHour}${offsetMinute}`;
}

export function createEntryIdentity(date = new Date(), id = uuidv7(date.getTime())): EntryIdentity {
  const createdAt = formatRfc3339(date);
  const year = createdAt.slice(0, 4);
  const month = createdAt.slice(5, 7);
  const notePath = `${ENTRY_ROOT}/${year}/${month}/${filenameTimestamp(createdAt)}--${id}.md`;
  return { id, createdAt, notePath, year, month };
}

export function createAttachmentPath(
  identity: EntryIdentity,
  kind: AttachmentKind,
  extension: string,
  assetId = uuidv7()
): { id: string; path: string } {
  const normalizedExtension = extension.toLowerCase().replace(/^\./, "").replace(/[^a-z0-9]/g, "") || "bin";
  return {
    id: assetId,
    path: `${ATTACHMENT_ROOT}/${identity.year}/${identity.month}/${identity.id}/${kind}--${assetId}.${normalizedExtension}`
  };
}

export function capturedLocalDate(createdAt: string): string {
  return createdAt.slice(0, 10);
}
