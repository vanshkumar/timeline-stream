export class TFile {
  path = "";
  name = "";
  parent = null;
  stat = { ctime: 0, mtime: 0, size: 0 };
  basename = "";
  extension = "";
}

export class TFolder {
  path = "";
  name = "";
  parent = null;
  children: Array<TFile | TFolder> = [];
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}
