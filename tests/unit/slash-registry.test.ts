import { describe, expect, it } from "vitest";
import { registerBuiltins } from "../../src/commands/builtins";
import { SlashCommandRegistry } from "../../src/commands/slash-registry";

describe("slash commands", () => {
  const commands = registerBuiltins(new SlashCommandRegistry());

  it("commits tagged multiline content", () => {
    expect(commands.interpret("/tag idea project/timeline\nA useful thought", [])).toEqual({
      kind: "commit",
      body: "A useful thought",
      tags: ["idea", "project/timeline"]
    });
  });

  it("turns a todo into Markdown", () => {
    expect(commands.interpret("/todo Buy milk\nRemember oat milk", ["errands"])).toEqual({
      kind: "commit",
      body: "- [ ] Buy milk\nRemember oat milk",
      tags: ["errands"]
    });
  });

  it("supports literal slashes and safe errors", () => {
    expect(commands.interpret("//today", [])).toEqual({ kind: "commit", body: "/today", tags: [] });
    expect(commands.interpret("/today", []).kind).toBe("error");
    expect(commands.interpret("/unknown", []).kind).toBe("error");
    expect(commands.interpret("/tag bad?tag\nBody", []).kind).toBe("error");
  });
});
