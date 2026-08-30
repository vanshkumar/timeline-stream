import { normalizeTags } from "../storage/entry-codec";

export type CommandOutcome =
  | { kind: "commit"; body: string; tags: string[] }
  | { kind: "draft"; body: string; tags: string[] }
  | { kind: "action"; action: "today" }
  | { kind: "error"; message: string };

export interface SlashCommandInput {
  argumentsText: string;
  payload: string;
  existingTags: string[];
}

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  run(input: SlashCommandInput): CommandOutcome;
}

function firstNonblankLine(lines: string[]): number {
  return lines.findIndex((line) => line.trim().length > 0);
}

export class SlashCommandRegistry {
  private readonly commands = new Map<string, SlashCommand>();

  register(command: SlashCommand): this {
    if (this.commands.has(command.name)) {
      throw new Error(`Slash command /${command.name} is already registered.`);
    }
    this.commands.set(command.name, command);
    return this;
  }

  list(): SlashCommand[] {
    return [...this.commands.values()];
  }

  interpret(text: string, existingTags: string[]): CommandOutcome {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const commandLineIndex = firstNonblankLine(lines);
    if (commandLineIndex < 0) {
      return { kind: "commit", body: "", tags: normalizeTags(existingTags) };
    }

    const commandLine = lines[commandLineIndex]!.trim();
    if (commandLine.startsWith("//")) {
      lines[commandLineIndex] = lines[commandLineIndex]!.replace("//", "/");
      return { kind: "commit", body: lines.join("\n").trim(), tags: normalizeTags(existingTags) };
    }
    if (!commandLine.startsWith("/")) {
      return { kind: "commit", body: text.trim(), tags: normalizeTags(existingTags) };
    }

    const match = /^\/([^\s]+)(?:\s+(.*))?$/.exec(commandLine);
    if (!match) {
      return { kind: "error", message: "Invalid slash command." };
    }
    const name = match[1]!.toLowerCase();
    const command = this.commands.get(name);
    if (!command) {
      return { kind: "error", message: `Unknown command: /${name}` };
    }

    const payload = lines.slice(commandLineIndex + 1).join("\n").trim();
    return command.run({
      argumentsText: match[2]?.trim() ?? "",
      payload,
      existingTags: normalizeTags(existingTags)
    });
  }
}
