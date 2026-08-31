import { describe, expect, it } from "vitest";
import {
  buildQuoteSelectionMarkdown,
  sourceLinkForNote
} from "../../src/commands/quote-selection";

describe("quote selection Markdown", () => {
  const sourcePath = "Research/Old notes/Feedback loops.md";
  const sourceLink = "↗ [[Research/Old notes/Feedback loops|source]]";

  it("formats a single-line selection as a blockquote", () => {
    expect(buildQuoteSelectionMarkdown("The first idea.", sourcePath)).toBe(
      `> The first idea.\n\n${sourceLink}`
    );
  });

  it("prefixes every line of a multiline selection", () => {
    expect(buildQuoteSelectionMarkdown("The first idea.\nThe second idea.", sourcePath)).toBe(
      `> The first idea.\n> The second idea.\n\n${sourceLink}`
    );
  });

  it("keeps internal blank lines inside one blockquote", () => {
    expect(buildQuoteSelectionMarkdown("The first idea.\n\nThe second idea.", sourcePath)).toBe(
      `> The first idea.\n>\n> The second idea.\n\n${sourceLink}`
    );
  });

  it("preserves indentation and internal content", () => {
    const selection = "  indented line\n\t- nested item\ntext with trailing spaces  ";

    expect(buildQuoteSelectionMarkdown(selection, sourcePath)).toBe(
      `>   indented line\n> \t- nested item\n> text with trailing spaces  \n\n${sourceLink}`
    );
  });

  it("removes only blank boundary lines", () => {
    const selection = "\n \t\n  first line  \n\nsecond line\t\n  \n";

    expect(buildQuoteSelectionMarkdown(selection, sourcePath)).toBe(
      `>   first line  \n>\n> second line\t\n\n${sourceLink}`
    );
  });

  it("returns only the source link for an empty selection", () => {
    expect(buildQuoteSelectionMarkdown("", sourcePath)).toBe(sourceLink);
    expect(buildQuoteSelectionMarkdown("\n \t\r\n", sourcePath)).toBe(sourceLink);
  });
});

describe("quote source links", () => {
  it("uses a nested vault path and removes one Markdown extension", () => {
    expect(sourceLinkForNote("Research/Old notes/Feedback loops.md")).toBe(
      "↗ [[Research/Old notes/Feedback loops|source]]"
    );
    expect(sourceLinkForNote("Research/Old notes/Feedback loops.MD")).toBe(
      "↗ [[Research/Old notes/Feedback loops|source]]"
    );
    expect(sourceLinkForNote("Research/Old notes/Feedback loops")).toBe(
      "↗ [[Research/Old notes/Feedback loops|source]]"
    );
  });

  it("uses an encoded vault path when a filename contains wikilink delimiters", () => {
    const sourcePath = "Research/Feedback #1 [draft] (old)^old|new.md";
    const generatedLink = sourceLinkForNote(sourcePath);
    const encodedPath = generatedLink.match(/\[source\]\((.+)\)$/)?.[1];

    expect(generatedLink).toBe(
      "↗ [source](Research/Feedback%20%231%20%5Bdraft%5D%20%28old%29%5Eold%7Cnew.md)"
    );
    expect(decodeURIComponent(encodedPath ?? "")).toBe(sourcePath);
    expect(encodedPath).not.toMatch(/^\.\.\//);
  });

  it("remains resolvable from a nested Stream entry path", () => {
    const sourceFile = { path: "Research/Old notes/Feedback loops.md" };
    const vaultFiles = [sourceFile];
    const metadataCache = {
      getFirstLinkpathDest(linkpath: string, referencingNotePath: string) {
        const normalizedLinkpath = linkpath.replace(/\.md$/i, "");
        const vaultRelativePath = `${normalizedLinkpath}.md`;
        const sourceFolder = referencingNotePath.slice(0, referencingNotePath.lastIndexOf("/"));
        const sourceRelativePath = `${sourceFolder}/${vaultRelativePath}`;

        return vaultFiles.find(
          (file) => file.path === vaultRelativePath || file.path === sourceRelativePath
        ) ?? null;
      }
    };
    const streamEntryPath = "Stream/entries/2026/08/01991f2f-entry.md";
    const generatedLink = sourceLinkForNote(sourceFile.path);
    const linkpath = generatedLink.match(/\[\[([^|]+)\|source\]\]/)?.[1];

    expect(linkpath).toBe("Research/Old notes/Feedback loops");
    expect(metadataCache.getFirstLinkpathDest(linkpath ?? "", streamEntryPath)).toEqual(sourceFile);
  });
});
