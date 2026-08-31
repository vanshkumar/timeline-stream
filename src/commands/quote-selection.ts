function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

function requiresEncodedLink(notePath: string): boolean {
  return ["#", "|", "^", ":", "%%", "[", "]", "\\", "\n", "\r"]
    .some((reserved) => notePath.includes(reserved));
}

function encodeLinkPathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function sourceLinkForNote(notePath: string): string {
  if (requiresEncodedLink(notePath)) {
    const encodedPath = notePath.split("/").map(encodeLinkPathSegment).join("/");
    return `↗ [source](${encodedPath})`;
  }
  const linkPath = notePath.replace(/\.md$/i, "");
  return `↗ [[${linkPath}|source]]`;
}

export function buildQuoteSelectionMarkdown(selection: string, sourcePath: string): string {
  const lines = selection.split(/\r?\n/);
  let first = 0;
  let last = lines.length;

  while (first < last && isBlankLine(lines[first] ?? "")) first += 1;
  while (last > first && isBlankLine(lines[last - 1] ?? "")) last -= 1;

  const sourceLink = sourceLinkForNote(sourcePath);
  if (first === last) return sourceLink;

  const quote = lines
    .slice(first, last)
    .map((line) => isBlankLine(line) ? ">" : `> ${line}`)
    .join("\n");
  return `${quote}\n\n${sourceLink}`;
}
