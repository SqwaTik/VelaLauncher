import { app } from "electron";
import { createHash, randomUUID } from "crypto";
import { promises as fs, existsSync } from "fs";
import { join, basename } from "path";
import { BUNDLED_MODS } from "../../shared/constants";
import { LOADERS, targetLabel, type GameTarget } from "../../shared/targets";
import type { ClientUpdateInfo } from "../../shared/types";
import { readArchiveText } from "./modrinth";
import { clientRuntimeDirectory, clientRuntimeJar, managedNeoForgeJar } from "./client-runtime";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Jars that the Vela client replaces: old Vela/Royale builds and separate copies of the mods compiled into it. */
const supersededIds = (target: GameTarget): Set<string> =>
  new Set<string>(["velaclient", "royalemaster", "royale-master", ...BUNDLED_MODS.map(mod => mod.id).filter(id => target.bundledMods.includes(id))]);

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const resourceRoot = (): string => app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "build");

/** Mod id, version and Minecraft dependency of a Fabric or NeoForge jar. */
async function readClientMetadata(path: string): Promise<{ id?: string; version?: string; minecraft?: string } | null> {
  const fabric = await readArchiveText(path, "fabric.mod.json").catch(() => null);
  if (fabric) {
    const json = JSON.parse(fabric);
    return { id: json?.id, version: json?.version, minecraft: JSON.stringify(json?.depends?.minecraft ?? "") };
  }
  const toml = await readArchiveText(path, "META-INF/neoforge.mods.toml").catch(() => null);
  if (!toml) return null;
  const id = toml.match(/^\s*modId\s*=\s*"([^"]+)"/m)?.[1];
  const version = toml.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1];
  const minecraft = toml.match(/modId\s*=\s*"minecraft"[\s\S]*?versionRange\s*=\s*"([^"]+)"/)?.[1];
  return { id, version, minecraft };
}

/** Where the launcher keeps a target's Vela jar inside the instance. */
export function clientTargetPath(root: string, target: GameTarget): string {
  return target.loader === "fabric" ? clientRuntimeJar(root) : managedNeoForgeJar(root);
}

async function loadBundle(target: GameTarget) {
  const source = join(resourceRoot(), "clients", target.clientFile);
  const bytes = await fs.readFile(source).catch(() => {
    throw new Error(`В лаунчере нет Vela для ${targetLabel(target)}. Переустановите Vela Launcher.`);
  });
  const metadata = await readClientMetadata(source);
  // The Vela client ships inside the launcher, so its own metadata is the source of its version; only the id and the
  // Minecraft dependency are verified. Pinning the version here broke launching after every client bump.
  if (metadata?.id !== "velaclient" || !metadata.version || !(metadata.minecraft ?? "").includes(target.minecraftVersion))
    throw new Error(`Пакет ${target.clientFile} не соответствует Minecraft ${target.minecraftVersion} (${LOADERS[target.loader].title}). Переустановите Vela Launcher.`);
  return { version: String(metadata.version), source, bytes, hash: sha256(bytes) };
}

export async function bundledClientUpdate(root: string, target: GameTarget): Promise<ClientUpdateInfo> {
  const client = await loadBundle(target);
  const hash = await fs.readFile(clientTargetPath(root, target)).then(sha256).catch(() => null);
  return {
    checkedAt: Date.now(), available: hash !== client.hash, installed: hash !== null,
    localCommitSha: hash, remoteCommitSha: client.hash, remoteVersion: client.version,
    commitMessage: null, commitDate: null, delivery: "release",
  };
}

/**
 * Stage the target's verified Vela build, retaining superseded mod jars outside the loader's scan path. Fabric loads
 * it from the hidden runtime folder (`-Dfabric.addMods`); NeoForge has no such switch, so there it is a managed file
 * in the mods folder.
 */
export async function installBundledClient(root: string, target: GameTarget): Promise<void> {
  const release = await loadBundle(target);
  const mods = join(root, "mods");
  const destination = clientTargetPath(root, target);
  await fs.mkdir(mods, { recursive: true });
  await fs.mkdir(clientRuntimeDirectory(root), { recursive: true });
  if (process.platform === "win32") await promisify(execFile)("attrib.exe", ["+H", clientRuntimeDirectory(root)], { windowsHide: true }).catch(() => undefined);
  const backup = join(root, "mod-backups", `vela-${Date.now()}-${randomUUID()}`);
  const saved: Array<{ from: string; to: string }> = [];
  const created: string[] = [];
  const stages: string[] = [];
  const superseded = supersededIds(target);
  const managed = basename(managedNeoForgeJar(root));
  try {
    const current = await fs.readFile(destination).then(bytes => sha256(bytes) === release.hash).catch(() => false);
    let stage: string | null = null;
    if (!current) {
      stage = `${destination}.${randomUUID()}.pending`;
      await fs.writeFile(stage, release.bytes, { flag: "wx" });
      stages.push(stage);
    }
    for (const file of await fs.readdir(mods)) {
      if (!file.endsWith(".jar") || basename(file) !== file) continue;
      // The managed NeoForge copy is replaced below; on Fabric a leftover one from a NeoForge stack is moved out.
      if (file === managed && target.loader === "neoforge") continue;
      let id: string | undefined;
      try { id = (await readClientMetadata(join(mods, file)))?.id; } catch { /* corrupt legacy jar */ }
      if (file !== managed && !superseded.has(id ?? "") && !/^royale-master-.*\.jar$/i.test(file)) continue;
      await fs.mkdir(backup, { recursive: true });
      const from = join(mods, file), to = join(backup, file);
      await fs.rename(from, to);
      saved.push({ from, to });
    }
    if (stage) {
      if (existsSync(destination)) {
        await fs.mkdir(backup, { recursive: true });
        const to = join(backup, `previous-${basename(destination)}`);
        await fs.rename(destination, to);
        saved.push({ from: destination, to });
      }
      await fs.rename(stage, destination);
      created.push(destination);
    }
    const metadata = join(root, ".vela-client.json");
    const temporary = `${metadata}.${randomUUID()}.tmp`;
    stages.push(temporary);
    await fs.writeFile(temporary, JSON.stringify({
      version: release.version, minecraft: target.minecraftVersion, loader: target.loader, loaderVersion: target.loaderVersion,
      files: [{ filename: basename(destination), sha256: release.hash }],
    }, null, 2));
    await fs.rename(temporary, metadata);
  } catch (error) {
    for (const path of created) await fs.rm(path, { force: true });
    for (const entry of saved.reverse()) await fs.rename(entry.to, entry.from);
    throw error;
  } finally {
    for (const stage of stages) await fs.rm(stage, { force: true }).catch(() => undefined);
  }
}
