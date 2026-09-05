import { BrowserWindow } from "electron";
import { createHash } from "crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  promises as fs,
} from "fs";
import { basename, dirname, extname, join, relative, resolve } from "path";
import { tmpdir } from "os";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import extract from "extract-zip";
import { ZipFile } from "yazl";
import { GAME, IPC } from "../../shared/constants";
import type {
  InstalledMod,
  ModpackProgress,
  ModpackResult,
  ModVersionFile,
} from "../../shared/types";
import { exactVersion, listInstalled, listResourcePacks, listShaderPacks } from "./modrinth";
import {
  activeInstance,
  createImportedInstance,
  gameDir,
  removeInstance,
} from "./store";

const USER_AGENT = "SqwaTik/VelaLauncher (vela-launcher)";
const DOWNLOAD_HOSTS = new Set([
  "cdn.modrinth.com",
  "github.com",
  "raw.githubusercontent.com",
  "gitlab.com",
]);
const GENERIC_DIRECTORIES = [
  "mods",
  "resourcepacks",
  "shaderpacks",
  "config",
  "defaultconfigs",
  "kubejs",
] as const;
const GENERIC_FILES = new Set(["options.txt", "servers.dat"]);

interface MrpackFile {
  path: string;
  hashes: { sha1: string; sha512: string };
  env?: { client?: "required" | "optional" | "unsupported" };
  downloads: string[];
  fileSize: number;
}

interface MrpackIndex {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  summary?: string;
  files: MrpackFile[];
  dependencies: Record<string, string>;
}

function emit(progress: ModpackProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC.modpackProgress, progress);
  }
}

function safeTarget(root: string, entryPath: string): string {
  if (
    !entryPath ||
    entryPath.includes("\0") ||
    /^[a-z]:[\\/]/i.test(entryPath) ||
    /^[\\/]/.test(entryPath)
  ) {
    throw new Error(`Небезопасный путь в сборке: ${entryPath || "(пустой)"}`);
  }
  const target = resolve(root, entryPath.replaceAll("/", "\\"));
  const rel = relative(resolve(root), target);
  if (!rel || rel.startsWith("..") || /^[a-z]:/i.test(rel)) {
    throw new Error(`Небезопасный путь в сборке: ${entryPath}`);
  }
  return target;
}

async function digest(path: string, algorithm: "sha1" | "sha512"): Promise<string> {
  return new Promise<string>((resolveHash, reject) => {
    const hash = createHash(algorithm);
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolveHash(hash.digest("hex")))
      .on("error", reject);
  });
}

async function fileMatches(path: string, file: MrpackFile): Promise<boolean> {
  try {
    const info = await fs.stat(path);
    if (!info.isFile() || (file.fileSize && info.size !== file.fileSize))
      return false;
    return (await digest(path, "sha512")) === file.hashes.sha512;
  } catch {
    return false;
  }
}

async function downloadMrpackFile(file: MrpackFile, destination: string): Promise<void> {
  const url = new URL(file.downloads[0] || "");
  if (url.protocol !== "https:" || !DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new Error(`Сборка содержит запрещённый адрес загрузки: ${url.hostname || "unknown"}`);
  }
  await fs.mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.royale-part`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`Не удалось загрузить ${basename(file.path)} (${response.status})`);
  }
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(temporary),
  );
  if (!(await fileMatches(temporary, file))) {
    await fs.rm(temporary, { force: true });
    throw new Error(`Файл ${basename(file.path)} не прошёл проверку целостности`);
  }
  await fs.rm(destination, { force: true });
  await fs.rename(temporary, destination);
}

async function copyTree(source: string, destination: string): Promise<number> {
  if (!existsSync(source)) return 0;
  const sourceRoot = resolve(source);
  const destinationRoot = resolve(destination);
  let copied = 0;
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const from = join(current, entry.name);
      const rel = relative(sourceRoot, from);
      const to = safeTarget(destinationRoot, rel);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await fs.mkdir(to, { recursive: true });
        await walk(from);
      } else if (entry.isFile()) {
        await fs.mkdir(dirname(to), { recursive: true });
        await fs.copyFile(from, to);
        copied += 1;
      }
    }
  };
  await walk(sourceRoot);
  return copied;
}

async function importMrpack(
  extracted: string,
  index: MrpackIndex,
  sourcePath: string,
): Promise<ModpackResult> {
  if (index.formatVersion !== 1 || index.game !== "minecraft") {
    throw new Error("Формат этой MRPACK-сборки не поддерживается");
  }
  if (!index.dependencies?.minecraft) {
    throw new Error("В MRPACK не указана версия Minecraft");
  }
  if (index.dependencies.minecraft !== GAME.minecraftVersion) {
    throw new Error(
      `Сборка рассчитана на Minecraft ${index.dependencies.minecraft}, а Vela — на ${GAME.minecraftVersion}`,
    );
  }
  const root = await gameDir();
  let downloaded = 0;
  let mods = 0;
  let resourcePacks = 0;
  let shaderPacks = 0;
  const files = index.files.filter((file) => file.env?.client !== "unsupported");
  for (const [position, file] of files.entries()) {
    const destination = safeTarget(root, file.path);
    const normalized = file.path.replaceAll("\\", "/").toLowerCase();
    if (normalized.startsWith("mods/")) mods += 1;
    if (normalized.startsWith("resourcepacks/")) resourcePacks += 1;
    if (normalized.startsWith("shaderpacks/")) shaderPacks += 1;
    emit({
      phase: "downloading",
      progress: files.length ? position / files.length : 0,
      message: "Импортируем сборку",
      detail: basename(file.path),
    });
    if (!(await fileMatches(destination, file))) {
      await downloadMrpackFile(file, destination);
      downloaded += 1;
    }
  }
  emit({
    phase: "copying",
    progress: 0.94,
    message: "Применяем настройки сборки",
  });
  let copied = 0;
  copied += await copyTree(join(extracted, "overrides"), root);
  copied += await copyTree(join(extracted, "client-overrides"), root);
  emit({ phase: "done", progress: 1, message: "Сборка импортирована" });
  return {
    path: sourcePath,
    name: index.name || basename(sourcePath, extname(sourcePath)),
    mods,
    resourcePacks,
    shaderPacks,
    files: downloaded + copied,
  };
}

async function genericRoot(extracted: string): Promise<string> {
  const entries = await fs.readdir(extracted, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    const nested = join(extracted, entries[0].name);
    const nestedEntries = await fs.readdir(nested);
    if (
      nestedEntries.some(
        (entry) =>
          (GENERIC_DIRECTORIES as readonly string[]).includes(entry.toLowerCase()) ||
          GENERIC_FILES.has(entry.toLowerCase()),
      )
    ) {
      return nested;
    }
  }
  return extracted;
}

async function importGenericZip(
  extracted: string,
  sourcePath: string,
): Promise<ModpackResult> {
  const source = await genericRoot(extracted);
  const root = await gameDir();
  let copied = 0;
  for (const directory of GENERIC_DIRECTORIES) {
    copied += await copyTree(join(source, directory), join(root, directory));
  }
  for (const name of GENERIC_FILES) {
    const from = join(source, name);
    if (!existsSync(from)) continue;
    await fs.copyFile(from, join(root, name));
    copied += 1;
  }
  if (!copied) {
    throw new Error(
      "В ZIP не найдены папки mods, resourcepacks, shaderpacks или config",
    );
  }
  const count = async (directory: string): Promise<number> => {
    try {
      return (await fs.readdir(join(source, directory), { withFileTypes: true }))
        .filter((entry) => entry.isFile()).length;
    } catch {
      return 0;
    }
  };
  emit({ phase: "done", progress: 1, message: "Сборка импортирована" });
  return {
    path: sourcePath,
    name: basename(sourcePath, extname(sourcePath)),
    mods: await count("mods"),
    resourcePacks: await count("resourcepacks"),
    shaderPacks: await count("shaderpacks"),
    files: copied,
  };
}

export async function importModpack(sourcePath: string): Promise<ModpackResult> {
  const extension = extname(sourcePath).toLowerCase();
  if (extension !== ".mrpack" && extension !== ".zip") {
    throw new Error("Поддерживаются только сборки .mrpack и .zip");
  }
  const info = await fs.stat(sourcePath);
  if (!info.isFile()) throw new Error("Файл сборки не найден");
  const temporary = await fs.mkdtemp(join(tmpdir(), "royale-modpack-"));
  emit({ phase: "reading", progress: 0, message: "Читаем сборку" });
  let importedInstanceId: string | null = null;
  const previousInstanceId = (await activeInstance()).id;
  try {
    await extract(sourcePath, { dir: temporary });
    const indexPath = join(temporary, "modrinth.index.json");
    if (existsSync(indexPath)) {
      const index = JSON.parse(await fs.readFile(indexPath, "utf8")) as MrpackIndex;
      const instance = await createImportedInstance(
        index.name || basename(sourcePath, extension),
      );
      importedInstanceId = instance.id;
      return {
        ...(await importMrpack(temporary, index, sourcePath)),
        instanceId: instance.id,
      };
    }
    if (extension === ".mrpack") {
      throw new Error("В MRPACK отсутствует modrinth.index.json");
    }
    const instance = await createImportedInstance(
      basename(sourcePath, extension),
    );
    importedInstanceId = instance.id;
    return {
      ...(await importGenericZip(temporary, sourcePath)),
      instanceId: instance.id,
    };
  } catch (error) {
    if (importedInstanceId)
      await removeInstance(importedInstanceId, previousInstanceId);
    throw error;
  } finally {
    const rel = relative(resolve(tmpdir()), resolve(temporary));
    if (rel && !rel.startsWith("..") && !rel.includes(":")) {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
}

async function walkFiles(root: string): Promise<Array<{ path: string; relative: string }>> {
  if (!existsSync(root)) return [];
  const base = resolve(root);
  const result: Array<{ path: string; relative: string }> = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".royale-") || entry.name.endsWith(".part"))
        continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && !entry.name.endsWith(".disabled")) {
        result.push({ path, relative: relative(base, path).replaceAll("\\", "/") });
      }
    }
  };
  await walk(base);
  return result;
}

function closeZip(zip: ZipFile, destination: string): Promise<void> {
  return new Promise<void>((resolveZip, reject) => {
    const output = createWriteStream(destination);
    output.once("close", resolveZip);
    output.once("error", reject);
    zip.outputStream.once("error", reject);
    zip.outputStream.pipe(output);
    zip.end();
  });
}

function addTree(zip: ZipFile, root: string, prefix: string): Promise<number> {
  return walkFiles(root).then((files) => {
    for (const file of files) {
      zip.addFile(file.path, `${prefix}/${file.relative}`);
    }
    return files.length;
  });
}

async function addKnownOrOverride(
  zip: ZipFile,
  indexFiles: MrpackFile[],
  item: InstalledMod,
  localPath: string,
  packPath: string,
): Promise<void> {
  if (item.versionId) {
    try {
      const version: ModVersionFile = await exactVersion(item.versionId);
      const localSha1 = await digest(localPath, "sha1");
      if (localSha1 === version.sha1) {
        indexFiles.push({
          path: packPath,
          hashes: {
            sha1: version.sha1,
            sha512: version.sha512 || (await digest(localPath, "sha512")),
          },
          env: { client: "required" },
          downloads: [version.url],
          fileSize: (await fs.stat(localPath)).size,
        });
        return;
      }
    } catch {
      /* A local/private file is embedded as an override below. */
    }
  }
  zip.addFile(localPath, `overrides/${packPath}`);
}

async function exportMrpack(destination: string): Promise<ModpackResult> {
  const root = await gameDir();
  const zip = new ZipFile();
  const indexFiles: MrpackFile[] = [];
  const [mods, resources, shaders] = await Promise.all([
    listInstalled(),
    listResourcePacks(),
    listShaderPacks(),
  ]);
  const enabledMods = mods.filter((item) => item.enabled);
  const all = [
    ...enabledMods.map((item) => ({ item, folder: "mods" })),
    ...resources.map((item) => ({ item, folder: "resourcepacks" })),
    ...shaders.map((item) => ({ item, folder: "shaderpacks" })),
  ];
  for (const [position, entry] of all.entries()) {
    emit({
      phase: "packing",
      progress: all.length ? position / all.length : 0,
      message: "Собираем MRPACK",
      detail: entry.item.title || entry.item.filename,
    });
    const localPath = join(root, entry.folder, entry.item.filename);
    if (existsSync(localPath)) {
      await addKnownOrOverride(
        zip,
        indexFiles,
        entry.item,
        localPath,
        `${entry.folder}/${entry.item.filename}`,
      );
    }
  }
  let extraFiles = 0;
  for (const folder of ["config", "defaultconfigs", "kubejs"]) {
    extraFiles += await addTree(zip, join(root, folder), `overrides/${folder}`);
  }
  for (const name of GENERIC_FILES) {
    const path = join(root, name);
    if (existsSync(path)) {
      zip.addFile(path, `overrides/${name}`);
      extraFiles += 1;
    }
  }
  const index: MrpackIndex = {
    formatVersion: 1,
    game: "minecraft",
    versionId: `royale-${Date.now()}`,
    name: "Vela",
    summary: "Сборка, экспортированная из Vela Launcher",
    files: indexFiles,
    dependencies: {
      minecraft: GAME.minecraftVersion,
      "fabric-loader": GAME.fabricLoader,
    },
  };
  zip.addBuffer(
    Buffer.from(JSON.stringify(index, null, 2), "utf8"),
    "modrinth.index.json",
  );
  await closeZip(zip, destination);
  emit({ phase: "done", progress: 1, message: "MRPACK готов" });
  return {
    path: destination,
    name: "Vela",
    mods: enabledMods.length,
    resourcePacks: resources.length,
    shaderPacks: shaders.length,
    files: all.length + extraFiles,
  };
}

async function exportGenericZip(destination: string): Promise<ModpackResult> {
  const root = await gameDir();
  const zip = new ZipFile();
  let files = 0;
  for (const directory of GENERIC_DIRECTORIES) {
    files += await addTree(zip, join(root, directory), directory);
  }
  for (const name of GENERIC_FILES) {
    const path = join(root, name);
    if (existsSync(path)) {
      zip.addFile(path, name);
      files += 1;
    }
  }
  zip.addBuffer(
    Buffer.from(
      JSON.stringify(
        {
          name: "Vela",
          minecraft: GAME.minecraftVersion,
          loader: `fabric-${GAME.fabricLoader}`,
          exportedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    ),
    ".royale-pack.json",
  );
  await closeZip(zip, destination);
  emit({ phase: "done", progress: 1, message: "ZIP готов" });
  return {
    path: destination,
    name: "Vela",
    mods: (await listInstalled()).filter((item) => item.enabled).length,
    resourcePacks: (await listResourcePacks()).length,
    shaderPacks: (await listShaderPacks()).length,
    files,
  };
}

export function exportModpack(destination: string): Promise<ModpackResult> {
  return extname(destination).toLowerCase() === ".zip"
    ? exportGenericZip(destination)
    : exportMrpack(destination);
}
