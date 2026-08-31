import type { SlashCommandRegistry } from "./slash-registry";

const VALID_TAG = /^(?=.*[\p{L}_/-])[\p{L}\p{N}_/-]+$/u;

export function registerBuiltins(registry: SlashCommandRegistry): SlashCommandRegistry {
  registry.register({
    name: "tag",
    description: "Add tags to this entry",
    usage: "/tag idea project, then write the entry on the next line",
    run: ({ argumentsText, payload, existingTags }) => {
      const requested = argumentsText
        .split(/\s+/)
        .map((tag) => tag.replace(/^#/, ""))
        .filter(Boolean);
      if (requested.length === 0) {
        return { kind: "error", message: "Usage: /tag tag-name [tag-name]" };
      }
      const invalid = requested.find((tag) => !VALID_TAG.test(tag));
      if (invalid) {
        return { kind: "error", message: `Invalid tag: ${invalid}` };
      }
      const tags = [...new Set([...existingTags, ...requested])];
      return payload
        ? { kind: "commit", body: payload, tags }
        : { kind: "draft", body: "", tags };
    }
  });

  registry.register({
    name: "todo",
    description: "Create a task entry",
    usage: "/todo Buy milk",
    run: ({ argumentsText, payload, existingTags }) => {
      if (!argumentsText) {
        return { kind: "error", message: "Usage: /todo task text" };
      }
      const body = `- [ ] ${argumentsText}${payload ? `\n${payload}` : ""}`;
      return { kind: "commit", body, tags: existingTags };
    }
  });
  return registry;
}
