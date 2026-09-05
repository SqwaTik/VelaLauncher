import { app } from "electron";
import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import { join, basename } from "path";
import { GAME } from "../../shared/constants";
import type { ClientUpdateInfo } from "../../shared/types";
import { readArchiveText } from "./modrinth";

const bundled = [
  { resource: "vela-client.jar", id: "velaclient", version: GAME.clientVersion, filename: `vela-client-${GAME.clientVersion}+26.2.jar` },
  { resource: "ias.jar", id: "ias", version: "9.0.7+26.2-fabric", filename: "IAS-9.0.7+26.2-fabric.jar" },
] as const;

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const resourceRoot = (): string => app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "build");

async function loadBundle() {
  return Promise.all(bundled.map(async (entry) => {
    const source = join(resourceRoot(), entry.resource);
    const bytes = await fs.readFile(source);
    const metadata = JSON.parse(await readArchiveText(source, "fabric.mod.json") ?? "null");
    if (metadata?.id !== entry.id || metadata?.version !== entry.version || !JSON.stringify(metadata?.depends?.minecraft).includes(GAME.minecraftVersion))
      throw new Error(`Пакет ${entry.resource} не соответствует Minecraft ${GAME.minecraftVersion}. Переустановите Vela Launcher.`);
    return { ...entry, source, bytes, hash: sha256(bytes) };
  }));
}

export async function bundledClientUpdate(root: string): Promise<ClientUpdateInfo> {
  const [client] = await loadBundle();
  const hash = await fs.readFile(join(root, "mods", client.filename)).then(sha256).catch(() => null);
  return {
    checkedAt: Date.now(), available: hash !== client.hash, installed: hash !== null,
    localCommitSha: hash, remoteCommitSha: client.hash, remoteVersion: GAME.clientVersion,
    commitMessage: null, commitDate: null, delivery: "release",
  };
}

/** Stage verified release files, retaining superseded mod jars outside Fabric's scan path. */
export async function installBundledClient(root: string): Promise<void> {
  const releases = await loadBundle();
  const mods = join(root, "mods");
  await fs.mkdir(mods, { recursive: true });
  const backup = join(root, "mod-backups", `vela-${Date.now()}-${randomUUID()}`);
  const saved: Array<{ from: string; to: string }> = [];
  const created: string[] = [];
  const stages: string[] = [];
  try {
    const replacements = [];
    for (const release of releases) {
      const target = join(mods, release.filename);
      if (await fs.readFile(target).then(bytes => sha256(bytes) === release.hash).catch(() => false)) continue;
      const stage = `${target}.${randomUUID()}.pending`;
      await fs.writeFile(stage, release.bytes, { flag: "wx" });
      stages.push(stage);
      replacements.push({ stage, target });
    }
    for (const file of await fs.readdir(mods)) {
      if (!file.endsWith(".jar") || basename(file) !== file) continue;
      if (releases.some(entry => entry.filename === file) && !replacements.some(entry => basename(entry.target) === file)) continue;
      let id: string | undefined;
      try { id = JSON.parse(await readArchiveText(join(mods, file), "fabric.mod.json") ?? "null")?.id; } catch { /* corrupt legacy jar */ }
      if (!replacements.some(entry => basename(entry.target) === file) && !["velaclient", "ias", "royalemaster", "royale-master"].includes(id ?? "") && !/^royale-master-.*\.jar$/i.test(file)) continue;
      await fs.mkdir(backup, { recursive: true });
      const from = join(mods, file), to = join(backup, file);
      await fs.rename(from, to);
      saved.push({ from, to });
    }
    for (const replacement of replacements) {
      await fs.rename(replacement.stage, replacement.target);
      created.push(replacement.target);
    }
    const metadata = join(root, ".vela-client.json");
    const temporary = `${metadata}.${randomUUID()}.tmp`;
    stages.push(temporary);
    await fs.writeFile(temporary, JSON.stringify({ version: GAME.clientVersion, minecraft: GAME.minecraftVersion, files: releases.map(({ filename, hash }) => ({ filename, sha256: hash })) }, null, 2));
    await fs.rename(temporary, metadata);
  } catch (error) {
    for (const target of created) await fs.rm(target, { force: true });
    for (const entry of saved.reverse()) await fs.rename(entry.to, entry.from);
    throw error;
  } finally {
    for (const stage of stages) await fs.rm(stage, { force: true }).catch(() => undefined);
  }
}
