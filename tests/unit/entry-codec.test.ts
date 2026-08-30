import { describe, expect, it } from "vitest";
import { createEntryIdentity } from "../../src/domain/identity";
import { EntryCodec, StaleEntryError } from "../../src/storage/entry-codec";

describe("EntryCodec", () => {
  const codec = new EntryCodec();
  const identity = createEntryIdentity(new Date("2026-08-30T01:45:12.347Z"), "01991f2f-0d36-7c6e-93a4-6a0a96d8596f");

  it("round-trips managed and unknown frontmatter", () => {
    const encoded = codec.encode({
      identity,
      body: "Met [[Sam]].",
      tags: ["idea", "#idea", "project/timeline"],
      userFrontmatter: { mood: "curious", rating: 4 }
    });
    const parsed = codec.parse(identity.notePath, encoded);
    expect(parsed.metadata.stream_id).toBe(identity.id);
    expect(parsed.metadata.tags).toEqual(["idea", "project/timeline"]);
    expect(parsed.metadata.mood).toBe("curious");
    expect(parsed.body).toBe("Met [[Sam]].\n");
  });

  it("edits only the body and preserves frontmatter bytes", () => {
    const encoded = codec.encode({ identity, body: "Before", userFrontmatter: { custom: "keep me" } });
    const edited = codec.replaceBodyIfUnchanged(encoded, encoded, "After");
    expect(codec.parse(identity.notePath, edited).metadata.custom).toBe("keep me");
    expect(codec.parse(identity.notePath, edited).body).toBe("After\n");
    expect(() => codec.replaceBodyIfUnchanged(`${encoded}changed`, encoded, "After")).toThrow(StaleEntryError);
  });
});
