import {
  promises as fs,
  existsSync,
  createWriteStream,
  createReadStream,
} from "fs";
import { basename, join } from "path";
import { createHash } from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { BrowserWindow, shell } from "electron";
import { MODRINTH_API, GAME, IPC } from "../../shared/constants";
import type {
  ModDependency,
  ModInstallResult,
  ModProject,
  ModSearchResult,
  ModVersionFile,
  InstalledMod,
  InstalledResourcePack,
} from "../../shared/types";
import { modsDir, resourcePacksDir } from "./store";

const UA = "SqwaTik/RoyaleLauncher (royale-launcher)";
const responseCache = new Map<string, { expires: number; value: unknown }>();

async function api<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(MODRINTH_API + path);
  if (params)
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
  const key = url.toString();
  const cached = responseCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value as T;

  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok)
    throw new Error(`Modrinth ${response.status}: ${response.statusText}`);
  const value = (await response.json()) as T;
  responseCache.set(key, { expires: Date.now() + 45_000, value });
  return value;
}

interface RawHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  follows: number;
  categories: string[];
  icon_url: string | null;
  project_type: string;
}

interface RawProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  downloads: number;
  followers: number;
  categories: string[];
  icon_url: string | null;
  gallery: { url: string }[];
  project_type: string;
  team?: string;
}

interface RawDependency {
  version_id: string | null;
  project_id: string | null;
  file_name: string | null;
  dependency_type: "required" | "optional" | "incompatible" | "embedded";
}

interface RawVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  downloads: number;
  date_published: string;
  game_versions: string[];
  loaders: string[];
  dependencies: RawDependency[];
  files: {
    url: string;
    filename: string;
    size: number;
    primary: boolean;
    hashes: { sha1: string };
  }[];
}

async function searchByType(
  query: string,
  category: string,
  sort: string,
  offset = 0,
  projectType: "mod" | "resourcepack" = "mod",
): Promise<ModSearchResult> {
  const facets: string[][] = [
    [`versions:${GAME.minecraftVersion}`],
    [`project_type:${projectType}`],
  ];
  if (projectType === "mod") facets.push(["categories:fabric"]);
  if (category && category !== "all") facets.push([`categories:${category}`]);
  const index = [
    "relevance",
    "downloads",
    "follows",
    "newest",
    "updated",
  ].includes(sort)
    ? sort
    : "relevance";

  const raw = await api<{ hits: RawHit[]; total_hits: number; offset: number }>(
    "/search",
    {
      query,
      limit: "30",
      offset: String(offset),
      index,
      facets: JSON.stringify(facets),
    },
  );

  return {
    hits: raw.hits.map((hit) => ({
      project_id: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      author: hit.author,
      downloads: hit.downloads,
      follows: hit.follows,
      categories: hit.categories,
      icon_url: hit.icon_url,
      gallery: [],
      project_type: hit.project_type,
    })),
    total_hits: raw.total_hits,
    offset: raw.offset,
  };
}

export function search(
  query: string,
  category: string,
  sort: string,
  offset = 0,
): Promise<ModSearchResult> {
  return searchByType(query, category, sort, offset, "mod");
}

export function searchResourcePacks(
  query: string,
  category: string,
  sort: string,
  offset = 0,
): Promise<ModSearchResult> {
  return searchByType(query, category, sort, offset, "resourcepack");
}

export async function project(projectId: string): Promise<ModProject> {
  const raw = await api<RawProject>(`/project/${projectId}`);
  return {
    project_id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    body: raw.body,
    author: "",
    downloads: raw.downloads,
    follows: raw.followers,
    categories: raw.categories,
    icon_url: raw.icon_url,
    gallery: raw.gallery.map((image) => image.url),
    project_type: raw.project_type,
  };
}

function dependency(raw: RawDependency): ModDependency {
  return {
    versionId: raw.version_id,
    projectId: raw.project_id,
    fileName: raw.file_name,
    type: raw.dependency_type,
  };
}

function versionFile(raw: RawVersion): ModVersionFile | null {
  const file = raw.files.find((entry) => entry.primary) ?? raw.files[0];
  if (!file) return null;
  return {
    version_id: raw.id,
    name: raw.name,
    version_number: raw.version_number,
    downloads: raw.downloads,
    date_published: raw.date_published,
    filename: file.filename,
    url: file.url,
    size: file.size,
    sha1: file.hashes.sha1,
    dependencies: (raw.dependencies ?? []).map(dependency),
  };
}

export async function versions(projectId: string): Promise<ModVersionFile[]> {
  const raw = await api<RawVersion[]>(`/project/${projectId}/version`, {
    game_versions: JSON.stringify([GAME.minecraftVersion]),
    loaders: JSON.stringify(["fabric"]),
  });
  return raw
    .map(versionFile)
    .filter((entry): entry is ModVersionFile => Boolean(entry));
}

async function exactVersion(versionId: string): Promise<ModVersionFile> {
  const raw = await api<RawVersion>(`/version/${versionId}`);
  const resolved = versionFile(raw);
  if (!resolved) throw new Error("Modrinth вернул версию без файла.");
  return resolved;
}

function emitModProgress(
  filename: string,
  progress: number,
  done: boolean,
  error?: string,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC.modProgress, {
      filename,
      progress,
      done,
      error,
    });
  }
}

interface MetadataShape {
  [filename: string]: {
    projectId?: string;
    title?: string;
    versionNumber?: string;
    versionId?: string;
    slug?: string;
    description?: string;
    body?: string;
    iconUrl?: string | null;
    gallery?: string[];
  };
}

async function readMetadata(
  dir: string,
  filename = ".royale-mods.json",
): Promise<MetadataShape> {
  try {
    return JSON.parse(
      await fs.readFile(join(dir, filename), "utf8"),
    ) as MetadataShape;
  } catch {
    return {};
  }
}

async function writeMetadata(
  dir: string,
  metadata: MetadataShape,
  filename = ".royale-mods.json",
): Promise<void> {
  const file = join(dir, filename);
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(metadata, null, 2), "utf8");
  await fs.rm(file, { force: true });
  await fs.rename(temp, file);
}

function normalizedName(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9а-яё]+/g, "");
}

async function attachMetadata(
  mod: InstalledMod,
  projectId: string,
  title: string,
  details?: ModProject,
): Promise<InstalledMod> {
  const dir = await modsDir();
  const metadata = await readMetadata(dir);
  metadata[mod.filename] = {
    ...metadata[mod.filename],
    projectId,
    title,
    slug: details?.slug,
    description: details?.description,
    body: details?.body,
    iconUrl: details?.icon_url,
    gallery: details?.gallery,
  };
  await writeMetadata(dir, metadata);
  mod.projectId = projectId;
  mod.title = title;
  if (details) Object.assign(mod, metadata[mod.filename]);
  return mod;
}

interface ProjectMeta {
  projectId: string;
  title: string;
  slug?: string;
  description?: string;
  body?: string;
  iconUrl?: string | null;
  gallery?: string[];
}

/** Download one resolved file, verify SHA-1, and retain project metadata. */
export async function installMod(
  version: ModVersionFile,
  meta?: ProjectMeta,
): Promise<InstalledMod> {
  const dir = await modsDir();
  await fs.mkdir(dir, { recursive: true });
  const destination = join(dir, version.filename);
  const temporary = `${destination}.part`;

  emitModProgress(version.filename, 0, false);
  const response = await fetch(version.url, { headers: { "User-Agent": UA } });
  if (!response.ok || !response.body)
    throw new Error(`Загрузка не удалась: ${response.status}`);

  const total = Number(
    response.headers.get("content-length") || version.size || 0,
  );
  let received = 0;
  const hash = createHash("sha1");
  const stream = Readable.fromWeb(
    response.body as Parameters<typeof Readable.fromWeb>[0],
  );
  stream.on("data", (chunk: Buffer) => {
    received += chunk.length;
    hash.update(chunk);
    if (total) emitModProgress(version.filename, received / total, false);
  });

  try {
    await pipeline(stream, createWriteStream(temporary));
  } catch (cause) {
    if (existsSync(temporary)) await fs.rm(temporary, { force: true });
    emitModProgress(version.filename, 0, true, "Ошибка загрузки");
    throw cause;
  }

  if (version.sha1 && hash.digest("hex") !== version.sha1) {
    await fs.rm(temporary, { force: true });
    emitModProgress(version.filename, 0, true, "Файл не прошёл проверку SHA-1");
    throw new Error("Файл мода повреждён: SHA-1 не совпадает.");
  }

  await fs.rm(destination, { force: true });
  await fs.rm(`${destination}.disabled`, { force: true });
  await fs.rename(temporary, destination);

  const metadata = await readMetadata(dir);
  metadata[version.filename] = {
    projectId: meta?.projectId,
    title: meta?.title,
    versionNumber: version.version_number,
    versionId: version.version_id,
    slug: meta?.slug,
    description: meta?.description,
    body: meta?.body,
    iconUrl: meta?.iconUrl,
    gallery: meta?.gallery,
  };
  await writeMetadata(dir, metadata);
  emitModProgress(version.filename, 1, true);

  return {
    filename: version.filename,
    size: (await fs.stat(destination)).size,
    enabled: true,
    ...metadata[version.filename],
  };
}

/** Resolve required dependencies recursively and reject known incompatibilities. */
export async function installProject(
  projectId: string,
  title: string,
): Promise<ModInstallResult> {
  const existing = await listInstalled();
  const byProject = new Map(
    existing.filter((mod) => mod.projectId).map((mod) => [mod.projectId!, mod]),
  );
  const byFilename = new Map(existing.map((mod) => [mod.filename, mod]));
  const installed: InstalledMod[] = [];
  const dependencyTitles: string[] = [];
  const visiting = new Set<string>();

  function inferredInstalled(displayTitle: string): InstalledMod | undefined {
    const needle = normalizedName(displayTitle);
    if (needle.length < 4) return undefined;
    return [...byFilename.values()].find(
      (mod) =>
        !mod.projectId &&
        normalizedName(mod.title || mod.filename).includes(needle),
    );
  }

  async function resolve(
    id: string,
    displayTitle: string,
    requestedVersionId: string | null,
    root: boolean,
  ): Promise<InstalledMod> {
    const already = byProject.get(id);
    if (already) return already;
    const details = await project(id);
    displayTitle = details.title || displayTitle;
    const inferred = inferredInstalled(displayTitle);
    if (inferred) {
      const remembered = await attachMetadata(
        inferred,
        id,
        displayTitle,
        details,
      );
      byProject.set(id, remembered);
      return remembered;
    }
    if (visiting.has(id))
      throw new Error(`Циклическая зависимость: ${displayTitle}`);
    visiting.add(id);

    const compatible = requestedVersionId
      ? await exactVersion(requestedVersionId)
      : (await versions(id))[0];
    if (!compatible) {
      throw new Error(
        `${displayTitle}: нет версии для Minecraft ${GAME.minecraftVersion} / Fabric.`,
      );
    }

    for (const dep of compatible.dependencies.filter(
      (item) => item.type === "incompatible",
    )) {
      let conflict = dep.projectId
        ? byProject.get(dep.projectId)
        : dep.fileName
          ? byFilename.get(dep.fileName)
          : undefined;
      if (!conflict && dep.projectId) {
        const details = await project(dep.projectId);
        conflict = inferredInstalled(details.title);
      }
      if (conflict) {
        throw new Error(
          `${displayTitle} несовместим с «${conflict.title || conflict.filename}». Сначала отключите или удалите конфликтующий мод.`,
        );
      }
    }

    for (const dep of compatible.dependencies.filter(
      (item) => item.type === "required",
    )) {
      if (dep.projectId) {
        const details = await project(dep.projectId);
        const wasInstalled = byProject.has(dep.projectId);
        await resolve(dep.projectId, details.title, dep.versionId, false);
        if (!wasInstalled && !dependencyTitles.includes(details.title))
          dependencyTitles.push(details.title);
      } else if (dep.fileName && !byFilename.has(dep.fileName)) {
        throw new Error(
          `${displayTitle}: не найдена обязательная зависимость ${dep.fileName}.`,
        );
      }
    }

    const result = await installMod(compatible, {
      projectId: id,
      title: displayTitle,
      slug: details.slug,
      description: details.description,
      body: details.body,
      iconUrl: details.icon_url,
      gallery: details.gallery,
    });
    byProject.set(id, result);
    byFilename.set(result.filename, result);
    installed.push(result);
    visiting.delete(id);
    if (!root && !dependencyTitles.includes(displayTitle))
      dependencyTitles.push(displayTitle);
    return result;
  }

  const root = await resolve(projectId, title, null, true);
  return { root, installed, dependencyTitles };
}

function emitResourceProgress(
  filename: string,
  progress: number,
  done: boolean,
  error?: string,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC.resourceProgress, {
      filename,
      progress,
      done,
      error,
    });
  }
}

async function resourceVersions(projectId: string): Promise<ModVersionFile[]> {
  const raw = await api<RawVersion[]>(`/project/${projectId}/version`, {
    game_versions: JSON.stringify([GAME.minecraftVersion]),
    loaders: JSON.stringify(["minecraft"]),
  });
  return raw
    .map(versionFile)
    .filter((entry): entry is ModVersionFile => Boolean(entry));
}

async function installResourceFile(
  version: ModVersionFile,
  details: ModProject,
): Promise<InstalledResourcePack> {
  if (basename(version.filename) !== version.filename)
    throw new Error("Modrinth вернул некорректное имя ресурспака.");
  const dir = await resourcePacksDir();
  await fs.mkdir(dir, { recursive: true });
  const destination = join(dir, version.filename);
  const temporary = `${destination}.part`;
  emitResourceProgress(version.filename, 0, false);
  const response = await fetch(version.url, { headers: { "User-Agent": UA } });
  if (!response.ok || !response.body)
    throw new Error(`Не удалось загрузить ресурспак: ${response.status}`);
  const total = Number(
    response.headers.get("content-length") || version.size || 0,
  );
  let received = 0;
  const hash = createHash("sha1");
  const stream = Readable.fromWeb(
    response.body as Parameters<typeof Readable.fromWeb>[0],
  );
  stream.on("data", (chunk: Buffer) => {
    received += chunk.length;
    hash.update(chunk);
    if (total) emitResourceProgress(version.filename, received / total, false);
  });
  try {
    await pipeline(stream, createWriteStream(temporary));
    if (version.sha1 && hash.digest("hex") !== version.sha1)
      throw new Error("Ресурспак не прошёл проверку SHA-1.");
    await fs.rm(destination, { force: true });
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    emitResourceProgress(version.filename, 0, true, "Ошибка загрузки");
    throw error;
  }
  const metadata = await readMetadata(dir, ".royale-resources.json");
  metadata[version.filename] = {
    projectId: details.project_id,
    title: details.title,
    versionNumber: version.version_number,
    versionId: version.version_id,
    slug: details.slug,
    description: details.description,
    body: details.body,
    iconUrl: details.icon_url,
    gallery: details.gallery,
  };
  await writeMetadata(dir, metadata, ".royale-resources.json");
  emitResourceProgress(version.filename, 1, true);
  return {
    filename: version.filename,
    size: (await fs.stat(destination)).size,
    enabled: true,
    ...metadata[version.filename],
  };
}

export async function installResourceProject(
  projectId: string,
): Promise<InstalledResourcePack> {
  const existing = await listResourcePacks();
  const installed = existing.find((pack) => pack.projectId === projectId);
  if (installed) return installed;
  const details = await project(projectId);
  if (details.project_type !== "resourcepack")
    throw new Error("Выбранный проект не является ресурспаком.");
  const compatible = (await resourceVersions(projectId))[0];
  if (!compatible)
    throw new Error(
      `Для ${details.title} нет версии под Minecraft ${GAME.minecraftVersion}.`,
    );
  return installResourceFile(compatible, details);
}

export async function listResourcePacks(): Promise<InstalledResourcePack[]> {
  const dir = await resourcePacksDir();
  if (!existsSync(dir)) return [];
  const metadata = await readMetadata(dir, ".royale-resources.json");
  const files = await fs.readdir(dir, { withFileTypes: true });
  const result: InstalledResourcePack[] = [];
  for (const entry of files) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".zip")) continue;
    result.push({
      filename: entry.name,
      size: (await fs.stat(join(dir, entry.name))).size,
      enabled: true,
      ...metadata[entry.name],
    });
  }
  return result.sort((a, b) =>
    (a.title || a.filename).localeCompare(b.title || b.filename),
  );
}

export async function removeResourcePack(filename: string): Promise<void> {
  if (basename(filename) !== filename)
    throw new Error("Некорректное имя ресурспака.");
  const dir = await resourcePacksDir();
  await fs.rm(join(dir, filename), { force: true });
  const metadata = await readMetadata(dir, ".royale-resources.json");
  delete metadata[filename];
  await writeMetadata(dir, metadata, ".royale-resources.json");
}

export async function revealResourcePack(filename: string): Promise<void> {
  if (basename(filename) !== filename)
    throw new Error("Некорректное имя ресурспака.");
  const dir = await resourcePacksDir();
  const target = join(dir, filename);
  if (existsSync(target)) shell.showItemInFolder(target);
  else await shell.openPath(dir);
}

export async function listInstalled(): Promise<InstalledMod[]> {
  const dir = await modsDir();
  if (!existsSync(dir)) return [];
  const metadata = await readMetadata(dir);
  const files = await fs.readdir(dir);
  const result: InstalledMod[] = [];
  for (const filenameOnDisk of files) {
    if (
      !filenameOnDisk.endsWith(".jar") &&
      !filenameOnDisk.endsWith(".jar.disabled")
    )
      continue;
    const filename = filenameOnDisk.replace(/\.disabled$/, "");
    result.push({
      filename,
      size: (await fs.stat(join(dir, filenameOnDisk))).size,
      enabled: !filenameOnDisk.endsWith(".disabled"),
      ...metadata[filename],
    });
  }
  let metadataChanged = false;
  for (const mod of result) {
    if (mod.iconUrl && mod.description) continue;
    try {
      let projectId = mod.projectId;
      let versionNumber = mod.versionNumber;
      let versionId = mod.versionId;
      if (!projectId) {
        const diskPath = join(
          dir,
          mod.enabled ? mod.filename : `${mod.filename}.disabled`,
        );
        const hash = await new Promise<string>((resolve, reject) => {
          const digest = createHash("sha1");
          createReadStream(diskPath)
            .on("data", (chunk) => digest.update(chunk))
            .on("end", () => resolve(digest.digest("hex")))
            .on("error", reject);
        });
        const version = await api<RawVersion>(`/version_file/${hash}`, {
          algorithm: "sha1",
        });
        projectId = version.project_id;
        versionNumber = version.version_number;
        versionId = version.id;
      }
      if (!projectId) continue;
      const details = await project(projectId);
      const enriched = {
        ...metadata[mod.filename],
        projectId,
        title: details.title,
        versionNumber,
        versionId,
        slug: details.slug,
        description: details.description,
        body: details.body,
        iconUrl: details.icon_url,
        gallery: details.gallery,
      };
      metadata[mod.filename] = enriched;
      Object.assign(mod, enriched);
      metadataChanged = true;
    } catch {
      // A local/private jar is still a valid installed mod; it simply has no catalog metadata.
    }
  }
  if (metadataChanged) await writeMetadata(dir, metadata);
  return result.sort((a, b) =>
    (a.title || a.filename).localeCompare(b.title || b.filename),
  );
}

export async function toggleMod(
  filename: string,
  enabled: boolean,
): Promise<void> {
  const dir = await modsDir();
  const active = join(dir, filename);
  const disabled = join(dir, `${filename}.disabled`);
  if (enabled && existsSync(disabled)) await fs.rename(disabled, active);
  else if (!enabled && existsSync(active)) await fs.rename(active, disabled);
}

export async function removeMod(filename: string): Promise<void> {
  const dir = await modsDir();
  for (const path of [join(dir, filename), join(dir, `${filename}.disabled`)]) {
    if (existsSync(path)) await fs.rm(path, { force: true });
  }
  const metadata = await readMetadata(dir);
  delete metadata[filename];
  await writeMetadata(dir, metadata);
}

export async function revealMod(filename: string): Promise<void> {
  if (basename(filename) !== filename)
    throw new Error("Некорректное имя мода.");
  const dir = await modsDir();
  const active = join(dir, filename);
  const disabled = join(dir, `${filename}.disabled`);
  const target = existsSync(active)
    ? active
    : existsSync(disabled)
      ? disabled
      : dir;
  shell.showItemInFolder(target);
}
