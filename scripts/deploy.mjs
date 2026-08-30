import { cp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const vaultFlag = args.indexOf("--vault");
const vaultPath = vaultFlag >= 0 ? args[vaultFlag + 1] : process.env.PERSONAL_STREAM_VAULT;

if (!vaultPath) {
  throw new Error("Pass --vault /absolute/path/to/vault or set PERSONAL_STREAM_VAULT.");
}

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const artifacts = ["main.js", "manifest.json", "styles.css"];
const releaseDir = path.join(root, "dist", "releases", manifest.version);

await mkdir(releaseDir, { recursive: true });
for (const artifact of artifacts) {
  await cp(path.join(root, artifact), path.join(releaseDir, artifact));
}

for (const configFolder of [".obsidian-mac", ".obsidian-ios"]) {
  const destination = path.join(vaultPath, configFolder, "plugins", manifest.id);
  await mkdir(destination, { recursive: true });
  for (const artifact of artifacts) {
    await cp(path.join(root, artifact), path.join(destination, artifact));
  }
  console.log(`Deployed ${manifest.id} ${manifest.version} to ${destination}`);
}

console.log(`Release backup: ${releaseDir}`);
