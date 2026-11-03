import { app } from "electron";
import { createHash, randomUUID } from "crypto";
import { promises as fs, existsSync } from "fs";
import { join, basename } from "path";
import { BUNDLED_MODS, GAME } from "../../shared/constants";
import type { ClientUpdateInfo } from "../../shared/types";
import { readArchiveText } from "./modrinth";
import { clientRuntimeDirectory, clientRuntimeJar } from "./client-runtime";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const bundled = [
  { resource: "vela-client.jar", id: "velaclient", version: GAME.clientVersion, filename: `vela-client-${GAME.clientVersion}+26.2.jar` },
] as const;

/** Jars that the Vela client replaces: old Vela/Royale builds and separate copies of the mods nested in it. */
const supersededIds = new Set<string>(["velaclient", "royalemaster", "royale-master", ...BUNDLED_MODS.map(mod => mod.id)]);

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const resourceRoot = (): string => app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "build");

async function loadBundle() {
  return Promise.all(bundled.map(async (entry) => {
    const source = join(resourceRoot(), entry.resource);
    const bytes = await fs.readFile(source);
    const metadata = JSON.parse(await readArchiveText(source, "fabric.mod.json") ?? "null");
    // The Vela client ships inside the launcher, so its own fabric.mod.json is the source of its version; only the
    // id and the Minecraft dependency are verified. Pinning the version here broke launching after every client bump.
    const versionOk = entry.id === "velaclient" ? typeof metadata?.version === "string" && metadata.version.length > 0 : metadata?.version === entry.version;
    if (metadata?.id !== entry.id || !versionOk || !JSON.stringify(metadata?.depends?.minecraft).includes(GAME.minecraftVersion))
      throw new Error(`Пакет ${entry.resource} не соответствует Minecraft ${GAME.minecraftVersion}. Переустановите Vela Launcher.`);
    return { ...entry, version: String(metadata.version), source, bytes, hash: sha256(bytes) };
  }));
}

export async function bundledClientUpdate(root: string): Promise<ClientUpdateInfo> {
  const [client] = await loadBundle();
  const hash = await fs.readFile(clientRuntimeJar(root)).then(sha256).catch(() => null);
  return {
    checkedAt: Date.now(), available: hash !== client.hash, installed: hash !== null,
    localCommitSha: hash, remoteCommitSha: client.hash, remoteVersion: client.version,
    commitMessage: null, commitDate: null, delivery: "release",
  };
}

/** Stage verified release files, retaining superseded mod jars outside Fabric's scan path. */
export async function installBundledClient(root: string): Promise<void> {
  const releases = await loadBundle();
  const mods = join(root, "mods");
  await fs.mkdir(mods, { recursive: true });
  await fs.mkdir(clientRuntimeDirectory(root), { recursive: true });
  if (process.platform === "win32") await promisify(execFile)("attrib.exe", ["+H", clientRuntimeDirectory(root)], { windowsHide: true }).catch(() => undefined);
  const backup = join(root, "mod-backups", `vela-${Date.now()}-${randomUUID()}`);
  const saved: Array<{ from: string; to: string }> = [];
  const created: string[] = [];
  const stages: string[] = [];
  try {
    const replacements = [];
    for (const release of releases) {
      const target = release.id === "velaclient" ? clientRuntimeJar(root) : join(mods, release.filename);
      if (await fs.readFile(target).then(bytes => sha256(bytes) === release.hash).catch(() => false)) continue;
      const stage = `${target}.${randomUUID()}.pending`;
      await fs.writeFile(stage, release.bytes, { flag: "wx" });
      stages.push(stage);
      replacements.push({ stage, target });
    }
    for (const file of await fs.readdir(mods)) {
      if (!file.endsWith(".jar") || basename(file) !== file) continue;
      if (releases.some(entry => entry.id !== "velaclient" && entry.filename === file) && !replacements.some(entry => basename(entry.target) === file)) continue;
      let id: string | undefined;
      try { id = JSON.parse(await readArchiveText(join(mods, file), "fabric.mod.json") ?? "null")?.id; } catch { /* corrupt legacy jar */ }
      if (!replacements.some(entry => basename(entry.target) === file) && !supersededIds.has(id ?? "") && !/^royale-master-.*\.jar$/i.test(file)) continue;
      await fs.mkdir(backup, { recursive: true });
      const from = join(mods, file), to = join(backup, file);
      await fs.rename(from, to);
      saved.push({ from, to });
    }
    for (const replacement of replacements) {
      // The private runtime target is outside the legacy-mod scan above.
      if (replacement.target === clientRuntimeJar(root) && existsSync(replacement.target)) {
        await fs.mkdir(backup, { recursive: true });
        const to = join(backup, "runtime-vela-client.jar");
        await fs.rename(replacement.target, to);
        saved.push({ from: replacement.target, to });
      }
      await fs.rename(replacement.stage, replacement.target);
      created.push(replacement.target);
    }
    const metadata = join(root, ".vela-client.json");
    const temporary = `${metadata}.${randomUUID()}.tmp`;
    stages.push(temporary);
    await fs.writeFile(temporary, JSON.stringify({ version: releases[0].version, minecraft: GAME.minecraftVersion, files: releases.map(({ filename, hash }) => ({ filename, sha256: hash })) }, null, 2));
    await fs.rename(temporary, metadata);
  } catch (error) {
    for (const target of created) await fs.rm(target, { force: true });
    for (const entry of saved.reverse()) await fs.rename(entry.to, entry.from);
    throw error;
  } finally {
    for (const stage of stages) await fs.rm(stage, { force: true }).catch(() => undefined);
  }
}
