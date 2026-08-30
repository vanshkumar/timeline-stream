import { describe, expect, it } from "vitest";
import { groupIdentityVariants } from "../../src/domain/groups";

describe("identity conflict grouping", () => {
  it("collapses identical copies but exposes divergent variants", () => {
    const grouped = groupIdentityVariants([
      { id: "same", path: "a.md", raw: "one" },
      { id: "same", path: "a 2.md", raw: "one" },
      { id: "conflict", path: "b.md", raw: "left" },
      { id: "conflict", path: "b 2.md", raw: "right" }
    ]);
    expect(grouped.filter((item) => item.item.id === "same" && item.visible)).toHaveLength(1);
    expect(grouped.find((item) => item.item.id === "same")?.conflict).toBe("identical");
    expect(grouped.filter((item) => item.item.id === "conflict" && item.visible)).toHaveLength(2);
    expect(grouped.find((item) => item.item.id === "conflict")?.conflict).toBe("divergent");
  });
});
