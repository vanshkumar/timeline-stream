import { access, cp, mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const configPath = path.join(root, ".personal-stream-install.json");
const artifacts = ["styles.css", "manifest.json", "main.js"];

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--target") {
      parsed.target = args[index + 1];
      index += 1;
    } else if (argument === "--config-folder") {
      parsed.configFolder = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return parsed;
}

async function readLocalConfig() {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw new Error(`Could not read ${configPath}: ${error.message}`);
  }
}

async function isDirectory(candidate) {
  try {
    return (await stat(candidate)).isDirectory();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function findVault(target, configFolder) {
  const resolvedTarget = path.resolve(target);
  const targetStat = await stat(resolvedTarget);
  let candidate = targetStat.isDirectory() ? resolvedTarget : path.dirname(resolvedTarget);

  while (true) {
    if (await isDirectory(path.join(candidate, configFolder))) {
      return candidate;
    }

    const parent = path.dirname(candidate);
    if (parent === candidate) {
      throw new Error(`Could not find ${configFolder} above ${resolvedTarget}.`);
    }
    candidate = parent;
  }
}

async function installArtifact(source, destination) {
  const temporary = `${destination}.installing-${process.pid}`;

  try {
    await cp(source, temporary);
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

const args = parseArgs(process.argv.slice(2));
const config = await readLocalConfig();
const target = args.target ?? config.target;
const configFolder = args.configFolder ?? config.configFolder ?? ".obsidian";

if (!target) {
  throw new Error(
    "No install target configured. Copy .personal-stream-install.example.json to " +
      ".personal-stream-install.json and set target to your vault or a file inside it."
  );
}

if (path.basename(configFolder) !== configFolder || configFolder === "." || configFolder === "..") {
  throw new Error("configFolder must be a single folder name such as .obsidian.");
}

const vaultPath = await findVault(target, configFolder);
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const destination = path.join(vaultPath, configFolder, "plugins", manifest.id);

for (const artifact of artifacts) {
  await access(path.join(root, artifact));
}

await mkdir(destination, { recursive: true });

// Install the executable last and preserve data.json plus any other local plugin data.
for (const artifact of artifacts) {
  await installArtifact(path.join(root, artifact), path.join(destination, artifact));
}

console.log(`Installed ${manifest.name} ${manifest.version}`);
console.log(`Vault: ${vaultPath}`);
console.log(`Plugin: ${destination}`);
