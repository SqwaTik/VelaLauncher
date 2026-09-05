import {
  promises as fs,
  existsSync,
  createWriteStream,
  createReadStream,
} from "fs";
import { basename, join } from "path";
import { createHash } from "crypto";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { BrowserWindow, shell } from "electron";
import { open as openZip } from "yauzl";
import { MODRINTH_API, GAME, IPC } from "../../shared/constants";
import type {
  ModDependency,
  ModInstallResult,
  ModProject,
  ModSearchResult,
  ModVersionFile,
  InstalledMod,
  InstalledResourcePack,
  InstalledShaderPack,
} from "../../shared/types";
import { modsDir, resourcePacksDir, shaderPacksDir } from "./store";

const UA = "SqwaTik/VelaLauncher (vela-launcher)";
const responseCache = new Map<string, { expires: number; value: unknown }>();

async function fetchWithRetry(
  input: string | URL,
  attempts = 3,
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, {
        headers: {
          "User-Agent": UA,
          "Accept-Encoding": "identity",
        },
      });
      if (
        response.ok ||
        (response.status !== 408 &&
          response.status !== 425 &&
          response.status !== 429 &&
          response.status < 500)
      ) {
        return response;
      }
      lastResponse = response;
    } catch {
      lastResponse = null;
    }
    if (attempt + 1 < attempts) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 450 * (attempt + 1)),
      );
    }
  }
  if (lastResponse) return lastResponse;
  throw new Error(
    "Сервер загрузки временно недоступен. Проверьте интернет и повторите попытку.",
  );
}

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

  const response = await fetchWithRetry(url);
  if (response.status === 404)
    throw new Error(
      "Проект или версия больше не найдены на Modrinth. Обновите каталог и выберите доступную версию.",
    );
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
    hashes: { sha1: string; sha512?: string };
  }[];
}

async function searchByType(
  query: string,
  category: string,
  sort: string,
  offset = 0,
  projectType: "mod" | "resourcepack" | "shader" = "mod",
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

export function searchShaders(
  query: string,
  category: string,
  sort: string,
  offset = 0,
): Promise<ModSearchResult> {
  return searchByType(query, category, sort, offset, "shader");
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
    sha512: file.hashes.sha512,
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

export async function exactVersion(versionId: string): Promise<ModVersionFile> {
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
    sha1?: string;
    expectedSize?: number;
    validatedMtimeMs?: number;
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

type FabricConstraint = string | string[];

interface FabricModJson {
  id?: string;
  name?: string;
  version?: string;
  provides?: string[];
  depends?: Record<string, FabricConstraint>;
  breaks?: Record<string, FabricConstraint>;
  conflicts?: Record<string, FabricConstraint>;
}

interface FabricModDescriptor {
  id: string;
  name: string;
  version: string;
  provides: string[];
  depends: Record<string, FabricConstraint>;
  breaks: Record<string, FabricConstraint>;
  conflicts: Record<string, FabricConstraint>;
  installed: InstalledMod;
}

interface FabricCompatibilityIssue {
  kind: "missing" | "version" | "breaks" | "conflicts";
  source: FabricModDescriptor;
  targetId: string;
  target?: FabricModDescriptor;
  constraint: FabricConstraint;
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

interface ModHealthCache {
  fingerprint: string;
  checkedAt: number;
}

async function modSetFingerprint(dir: string, javaMajor = GAME.javaMajor as number): Promise<string> {
  if (!existsSync(dir)) return createHash("sha1").update("empty").digest("hex");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jar"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const rows = await Promise.all(
    files.map(async (filename) => {
      const stat = await fs.stat(join(dir, filename));
      return `${filename}\0${stat.size}\0${stat.mtimeMs}`;
    }),
  );
  return createHash("sha1").update([GAME.minecraftVersion, GAME.fabricLoader, javaMajor, ...rows].join("\n")).digest("hex");
}

async function readModHealth(dir: string): Promise<ModHealthCache | null> {
  try {
    return JSON.parse(
      await fs.readFile(join(dir, ".royale-mod-health.json"), "utf8"),
    ) as ModHealthCache;
  } catch {
    return null;
  }
}

async function writeModHealth(dir: string, javaMajor: number): Promise<void> {
  const file = join(dir, ".royale-mod-health.json");
  const temporary = `${file}.tmp`;
  await fs.writeFile(
    temporary,
    JSON.stringify(
      {
        fingerprint: await modSetFingerprint(dir, javaMajor),
        checkedAt: Date.now(),
      } satisfies ModHealthCache,
      null,
      2,
    ),
    "utf8",
  );
  await fs.rm(file, { force: true });
  await fs.rename(temporary, file);
}

async function digestFile(
  path: string,
  algorithm: "sha1" | "sha512",
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const digest = createHash(algorithm);
    createReadStream(path)
      .on("data", (chunk) => digest.update(chunk))
      .on("end", () => resolve(digest.digest("hex")))
      .on("error", reject);
  });
}

async function sha1File(path: string): Promise<string> {
  return digestFile(path, "sha1");
}

export async function readArchiveText(
  path: string,
  requestedEntry: string,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    openZip(path, { lazyEntries: true, autoClose: true }, (error, zip) => {
      if (error || !zip) return finish(null);
      zip.once("error", () => finish(null));
      zip.once("end", () => finish(null));
      zip.on("entry", (entry) => {
        if (entry.fileName !== requestedEntry) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return finish(null);
          const chunks: Buffer[] = [];
          let length = 0;
          stream.on("data", (chunk: Buffer) => {
            length += chunk.length;
            if (length <= 2 * 1024 * 1024) chunks.push(chunk);
          });
          stream.once("error", () => finish(null));
          stream.once("end", () => {
            finish(
              length <= 2 * 1024 * 1024
                ? Buffer.concat(chunks).toString("utf8")
                : null,
            );
            try {
              zip.close();
            } catch {
              /* the entry has already been read */
            }
          });
        });
      });
      zip.readEntry();
    });
  });
}

async function readFabricModDescriptor(
  path: string,
  installed: InstalledMod,
): Promise<FabricModDescriptor | null> {
  const text = await readArchiveText(path, "fabric.mod.json");
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as FabricModJson;
    if (!raw.id || !raw.version) return null;
    return {
      id: raw.id,
      name: raw.name || installed.title || raw.id,
      version: raw.version,
      provides: Array.isArray(raw.provides) ? raw.provides : [],
      depends: raw.depends ?? {},
      breaks: raw.breaks ?? {},
      conflicts: raw.conflicts ?? {},
      installed,
    };
  } catch {
    return null;
  }
}

function versionParts(value: string): number[] | null {
  const match = value.trim().match(/^v?(\d+(?:\.\d+)*)/i);
  return match ? match[1].split(".").map(Number) : null;
}

function compareVersions(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference < 0 ? -1 : 1;
  }
  return 0;
}

function satisfiesVersionToken(version: string, token: string): boolean {
  const normalized = token.trim();
  if (!normalized || normalized === "*") return true;
  const actual = versionParts(version);
  if (!actual) return false;

  const wildcard = normalized.match(/^v?(\d+(?:\.\d+)*)(?:\.(?:x|X|\*))$/);
  if (wildcard) {
    const prefix = wildcard[1].split(".").map(Number);
    return prefix.every((part, index) => actual[index] === part);
  }

  const match = normalized.match(/^(<=|>=|<|>|=|~|\^)?\s*v?(\d+(?:\.\d+)*)/);
  if (!match) return version === normalized;
  const operator = match[1] || "=";
  const expected = match[2].split(".").map(Number);
  const compared = compareVersions(actual, expected);
  if (operator === "<") return compared < 0;
  if (operator === "<=") return compared <= 0;
  if (operator === ">") return compared > 0;
  if (operator === ">=") return compared >= 0;
  if (operator === "~") {
    const upper = [...expected];
    const bump = Math.max(0, upper.length - 2);
    upper[bump] = (upper[bump] ?? 0) + 1;
    for (let index = bump + 1; index < upper.length; index += 1)
      upper[index] = 0;
    return compared >= 0 && compareVersions(actual, upper) < 0;
  }
  if (operator === "^") {
    const upper = [...expected];
    const bump = Math.max(
      0,
      upper.findIndex((part) => part !== 0),
    );
    upper[bump] = (upper[bump] ?? 0) + 1;
    for (let index = bump + 1; index < upper.length; index += 1)
      upper[index] = 0;
    return compared >= 0 && compareVersions(actual, upper) < 0;
  }
  return compared === 0;
}

function satisfiesVersion(version: string, constraint: FabricConstraint): boolean {
  const alternatives = Array.isArray(constraint) ? constraint : [constraint];
  return alternatives.some((alternative) =>
    alternative
      .split(/\s*\|\|\s*/)
      .some((branch) =>
        branch
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .every((token) => satisfiesVersionToken(version, token)),
      ),
  );
}

function candidateSatisfies(
  candidate: ModVersionFile,
  constraint: FabricConstraint,
): boolean {
  const values = [
    candidate.version_number,
    candidate.name,
    candidate.filename,
  ];
  const numericSegments = values.flatMap((value) =>
    [...value.matchAll(/v?(\d+(?:\.\d+)+)/gi)].map((match) => match[1]),
  );
  return [...values, ...numericSegments].some((value) =>
    satisfiesVersion(value, constraint),
  );
}

async function fabricDescriptors(): Promise<FabricModDescriptor[]> {
  const dir = await modsDir();
  const installed = (await listInstalled(false)).filter((mod) => mod.enabled);
  return (
    await Promise.all(
      installed.map((mod) =>
        readFabricModDescriptor(join(dir, mod.filename), mod),
      ),
    )
  ).filter((entry): entry is FabricModDescriptor => Boolean(entry));
}

function fabricCompatibilityIssues(
  descriptors: FabricModDescriptor[],
  javaMajor = GAME.javaMajor as number,
): FabricCompatibilityIssue[] {
  const byId = new Map<string, FabricModDescriptor>();
  for (const descriptor of descriptors) {
    byId.set(descriptor.id, descriptor);
    for (const provided of descriptor.provides) byId.set(provided, descriptor);
  }
  const builtins = new Map<string, string>([
    ["minecraft", GAME.minecraftVersion],
    ["fabricloader", GAME.fabricLoader],
    ["java", String(javaMajor)],
  ]);
  const hasFabricApi = byId.has("fabric-api");
  const issues: FabricCompatibilityIssue[] = [];

  for (const source of descriptors) {
    for (const [targetId, constraint] of Object.entries(source.depends)) {
      const builtin = builtins.get(targetId);
      if (builtin !== undefined) {
        if (!satisfiesVersion(builtin, constraint))
          issues.push({ kind: "version", source, targetId, constraint });
        continue;
      }
      const target = byId.get(targetId);
      // Fabric API ships most fabric-* modules as nested jars. The loader
      // resolves those modules even though they are not top-level files.
      if (!target && hasFabricApi && targetId.startsWith("fabric-")) continue;
      if (!target) {
        issues.push({ kind: "missing", source, targetId, constraint });
      } else if (!satisfiesVersion(target.version, constraint)) {
        issues.push({
          kind: "version",
          source,
          targetId,
          target,
          constraint,
        });
      }
    }

    for (const [targetId, constraint] of Object.entries(source.breaks)) {
      const target = byId.get(targetId);
      if (target && satisfiesVersion(target.version, constraint))
        issues.push({
          kind: "breaks",
          source,
          targetId,
          target,
          constraint,
        });
    }
    for (const [targetId, constraint] of Object.entries(source.conflicts)) {
      const target = byId.get(targetId);
      if (target && satisfiesVersion(target.version, constraint))
        issues.push({
          kind: "conflicts",
          source,
          targetId,
          target,
          constraint,
        });
    }
  }
  return issues;
}

export async function isJarStructurallyValid(path: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (valid: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(valid);
    };
    openZip(
      path,
      { lazyEntries: true, autoClose: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) return finish(false);
        let readToEnd = false;
        let invalid = false;
        const fail = (): void => {
          invalid = true;
          try {
            zip.close();
          } catch {
            finish(false);
          }
        };
        zip.once("error", fail);
        zip.once("end", () => {
          readToEnd = true;
        });
        // On Windows the ZIP handle must close before a verified .part file
        // can be renamed into the live mods directory.
        zip.once("close", () => finish(readToEnd && !invalid));
        zip.on("entry", (entry) => {
          if (/\/$/.test(entry.fileName)) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) return fail();
            stream.once("error", fail);
            stream.once("end", () => zip.readEntry());
            stream.resume();
          });
        });
        zip.readEntry();
      },
    );
  });
}

async function replaceDownloadedFile(
  temporary: string,
  destination: string,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 7; attempt += 1) {
    try {
      await fs.rm(destination, { force: true });
      await fs.rename(temporary, destination);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 7)
        await new Promise<void>((resolve) => setTimeout(resolve, 80 * attempt));
    }
  }

  // Antivirus scanners can briefly deny renames while still permitting a
  // byte-for-byte copy of the already verified archive.
  try {
    await fs.rm(destination, { force: true });
    await fs.copyFile(temporary, destination);
    await fs.rm(temporary, { force: true });
  } catch {
    throw lastError;
  }
}

async function downloadVerifiedArchive(
  version: ModVersionFile,
  temporary: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await fs.rm(temporary, { force: true });
    onProgress(0);
    try {
      const response = await fetchWithRetry(version.url);
      if (!response.ok || !response.body)
        throw new Error(`Сервер загрузки ответил ${response.status}.`);

      const expectedSize =
        version.size || Number(response.headers.get("content-length") || 0);
      let received = 0;
      const tracker = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (expectedSize)
            onProgress(Math.min(0.995, received / expectedSize));
          callback(null, chunk);
        },
      });

      // Progress is measured inside the pipeline. Attaching a `data` listener
      // before piping switches a Readable into flowing mode and can drop a
      // 16 KiB chunk before the file writer is attached.
      await pipeline(
        Readable.fromWeb(
          response.body as Parameters<typeof Readable.fromWeb>[0],
        ),
        tracker,
        createWriteStream(temporary, { flags: "w" }),
      );

      const info = await fs.stat(temporary);
      if (version.size && info.size !== version.size)
        throw new Error("Получен неполный файл.");

      const actualHash = version.sha512
        ? await digestFile(temporary, "sha512")
        : await sha1File(temporary);
      const expectedHash = version.sha512 || version.sha1;
      if (expectedHash && actualHash !== expectedHash)
        throw new Error("Контрольная сумма файла не совпала.");
      if (!(await isJarStructurallyValid(temporary)))
        throw new Error("Архив загрузился не полностью.");

      onProgress(1);
      return;
    } catch (error) {
      lastError = error;
      await fs.rm(temporary, { force: true });
      if (attempt < 3)
        await new Promise<void>((resolve) =>
          setTimeout(resolve, 350 * attempt),
        );
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `Не удалось получить целый файл после трёх попыток: ${lastError.message}`
      : "Не удалось получить целый файл после трёх попыток.",
  );
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

async function removeReplacedVersion(
  previous: InstalledMod | undefined,
  next: InstalledMod,
): Promise<void> {
  if (!previous || previous.filename === next.filename) return;
  const dir = await modsDir();
  await fs.rm(join(dir, previous.filename), { force: true });
  await fs.rm(join(dir, `${previous.filename}.disabled`), { force: true });
  const metadata = await readMetadata(dir);
  delete metadata[previous.filename];
  await writeMetadata(dir, metadata);
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

  try {
    await downloadVerifiedArchive(version, temporary, (progress) =>
      emitModProgress(version.filename, progress, false),
    );
  } catch (cause) {
    if (existsSync(temporary)) await fs.rm(temporary, { force: true });
    emitModProgress(version.filename, 0, true, "Ошибка загрузки");
    throw cause;
  }

  await fs.rm(`${destination}.disabled`, { force: true });
  await replaceDownloadedFile(temporary, destination);
  const installedStat = await fs.stat(destination);

  const metadata = await readMetadata(dir);
  metadata[version.filename] = {
    sha1: version.sha1,
    expectedSize: version.size || installedStat.size,
    validatedMtimeMs: installedStat.mtimeMs,
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
    size: installedStat.size,
    enabled: true,
    ...metadata[version.filename],
  };
}

export async function repairInstalledMods(
  onStatus?: (message: string) => void,
  javaMajor = GAME.javaMajor as number,
): Promise<{ repaired: string[]; disabled: string[] }> {
  const dir = await modsDir();
  const initialFingerprint = await modSetFingerprint(dir, javaMajor);
  const health = await readModHealth(dir);
  const installed = await listInstalled(false);
  const repaired: string[] = [];
  const disabled: string[] = [];

  for (const mod of installed.filter((entry) => entry.enabled)) {
    if (/^royale-master-/i.test(mod.filename)) continue;
    const path = join(dir, mod.filename);
    const stat = await fs.stat(path);
    const cachedValidationIsCurrent =
      mod.expectedSize === stat.size &&
      mod.validatedMtimeMs === stat.mtimeMs &&
      (Boolean(mod.sha1) || !mod.projectId);
    if (cachedValidationIsCurrent) continue;

    const structural = await isJarStructurallyValid(path);
    if (!mod.projectId || !mod.versionId) {
      if (!structural) {
        onStatus?.(`Отключаем повреждённый мод ${mod.title || mod.filename}`);
        await fs.rm(`${path}.disabled`, { force: true });
        await fs.rename(path, `${path}.disabled`);
        disabled.push(mod.title || mod.filename);
      } else {
        const metadata = await readMetadata(dir);
        metadata[mod.filename] = {
          ...metadata[mod.filename],
          expectedSize: stat.size,
          validatedMtimeMs: stat.mtimeMs,
        };
        await writeMetadata(dir, metadata);
      }
      continue;
    }

    if (
      structural &&
      mod.sha1 &&
      (!mod.expectedSize || mod.expectedSize === stat.size) &&
      (await sha1File(path)) === mod.sha1
    ) {
      const metadata = await readMetadata(dir);
      metadata[mod.filename] = {
        ...metadata[mod.filename],
        expectedSize: stat.size,
        validatedMtimeMs: stat.mtimeMs,
      };
      await writeMetadata(dir, metadata);
      continue;
    }

    let expected: ModVersionFile;
    try {
      expected = await exactVersion(mod.versionId);
    } catch {
      if (structural) continue;
      onStatus?.(`Отключаем повреждённый мод ${mod.title || mod.filename}`);
      await fs.rm(`${path}.disabled`, { force: true });
      await fs.rename(path, `${path}.disabled`);
      disabled.push(mod.title || mod.filename);
      continue;
    }

    const currentMetadata = await readMetadata(dir);
    const remembered = currentMetadata[mod.filename];
    // Never trust only size/mtime here. A failed write can keep both while
    // damaging bytes inside the ZIP, which Fabric reports as invalid LOC/END.
    const valid =
      structural &&
      stat.size === expected.size &&
      (await sha1File(path)) === expected.sha1;
    if (valid) {
      currentMetadata[mod.filename] = {
        ...remembered,
        sha1: expected.sha1,
        expectedSize: expected.size,
        validatedMtimeMs: stat.mtimeMs,
      };
      await writeMetadata(dir, currentMetadata);
      continue;
    }

    onStatus?.(`Восстанавливаем ${mod.title || mod.filename}`);
    const restored = await installMod(expected, {
      projectId: mod.projectId,
      title: mod.title || mod.filename,
      slug: mod.slug,
      description: mod.description,
      body: mod.body,
      iconUrl: mod.iconUrl,
      gallery: mod.gallery,
    });
    if (restored.filename !== mod.filename) {
      await fs.rm(path, { force: true });
      const latestMetadata = await readMetadata(dir);
      delete latestMetadata[mod.filename];
      await writeMetadata(dir, latestMetadata);
    }
    repaired.push(mod.title || mod.filename);
  }

  if (
    repaired.length === 0 &&
    disabled.length === 0 &&
    health?.fingerprint === initialFingerprint
  ) {
    return { repaired, disabled };
  }

  // Local Fabric metadata is enough for the common healthy case. Modrinth is
  // contacted only when the installed set changed and exposes a real issue.
  const localIssues = fabricCompatibilityIssues(await fabricDescriptors(), javaMajor);
  if (localIssues.length) {
    const dependencyRepairs = await reconcileRequiredModVersions(onStatus);
    for (const title of dependencyRepairs) {
      if (!repaired.includes(title)) repaired.push(title);
    }
    const compatibilityRepairs =
      await reconcileFabricMetadataCompatibility(onStatus, javaMajor);
    for (const title of compatibilityRepairs) {
      if (!repaired.includes(title)) repaired.push(title);
    }
  }

  await writeModHealth(dir, javaMajor);
  return { repaired, disabled };
}

async function reconcileRequiredModVersions(
  onStatus?: (message: string) => void,
): Promise<string[]> {
  const current = await listInstalled(false);
  const byProject = new Map(
    current
      .filter((mod) => mod.enabled && mod.projectId)
      .map((mod) => [mod.projectId!, mod]),
  );
  const checked = new Set<string>();
  const repaired: string[] = [];

  async function check(mod: InstalledMod): Promise<void> {
    if (!mod.projectId || !mod.versionId) return;
    const key = `${mod.projectId}@${mod.versionId}`;
    if (checked.has(key)) return;
    checked.add(key);

    let version: ModVersionFile;
    try {
      version = await exactVersion(mod.versionId);
    } catch {
      return;
    }

    for (const dependency of version.dependencies.filter(
      (item) => item.type === "required" && item.projectId && item.versionId,
    )) {
      const projectId = dependency.projectId!;
      const versionId = dependency.versionId!;
      let installed = byProject.get(projectId);
      if (installed?.versionId !== versionId) {
        const details = await project(projectId);
        const required = await exactVersion(versionId);
        onStatus?.(`Подбираем совместимую версию ${details.title}`);
        const replacement = await installMod(required, {
          projectId,
          title: details.title,
          slug: details.slug,
          description: details.description,
          body: details.body,
          iconUrl: details.icon_url,
          gallery: details.gallery,
        });
        await removeReplacedVersion(installed, replacement);
        installed = replacement;
        byProject.set(projectId, replacement);
        repaired.push(details.title);
      }
      if (installed) await check(installed);
    }
  }

  for (const mod of current) await check(mod);
  return repaired;
}

function constraintText(constraint: FabricConstraint): string {
  return (Array.isArray(constraint) ? constraint : [constraint]).join(" или ");
}

async function reconcileFabricMetadataCompatibility(
  onStatus?: (message: string) => void,
  javaMajor = GAME.javaMajor as number,
): Promise<string[]> {
  const repaired: string[] = [];
  const attempted = new Set<string>();

  for (let pass = 0; pass < 8; pass += 1) {
    const descriptors = await fabricDescriptors();
    const issues = fabricCompatibilityIssues(descriptors, javaMajor);
    if (!issues.length) return repaired;

    const installedProjectIds = new Set(
      descriptors
        .map((entry) => entry.installed.projectId)
        .filter((id): id is string => Boolean(id)),
    );
    let changed = false;

    for (const issue of issues) {
      if (issue.kind === "missing") {
        // Modrinth dependencies with a project/version id were already handled
        // above. This fallback also supports manually imported Fabric jars:
        // locate a project whose slug/title matches the missing Fabric id.
        const result = await search(issue.targetId, "all", "relevance").catch(
          () => null,
        );
        const normalizedId = normalizedName(issue.targetId);
        const match = result?.hits.find(
          (hit) =>
            normalizedName(hit.slug) === normalizedId ||
            normalizedName(hit.title) === normalizedId,
        );
        if (match && !attempted.has(`missing:${match.project_id}`)) {
          attempted.add(`missing:${match.project_id}`);
          onStatus?.(`Устанавливаем зависимость ${match.title}`);
          await installProject(match.project_id, match.title);
          repaired.push(match.title);
          changed = true;
          break;
        }
        continue;
      }

      const target = issue.target;
      if (!target?.installed.projectId) continue;
      const targetId = target.id;
      const requirements = issues.filter(
        (entry) =>
          entry.target?.installed.projectId === target.installed.projectId ||
          entry.targetId === targetId,
      );
      const candidates = await versions(target.installed.projectId).catch(
        () => [],
      );
      const replacement = candidates.find((candidate) => {
        if (
          candidate.version_id === target.installed.versionId ||
          attempted.has(candidate.version_id)
        )
          return false;
        if (
          candidate.dependencies.some(
            (dependency) =>
              dependency.type === "incompatible" &&
              dependency.projectId &&
              installedProjectIds.has(dependency.projectId),
          )
        )
          return false;
        return requirements.every((requirement) => {
          const matches = candidateSatisfies(
            candidate,
            requirement.constraint,
          );
          return requirement.kind === "version" ? matches : !matches;
        });
      });
      if (!replacement) continue;

      attempted.add(replacement.version_id);
      onStatus?.(`Подбираем совместимую версию ${target.name}`);
      const next = await installMod(replacement, {
        projectId: target.installed.projectId,
        title: target.installed.title || target.name,
        slug: target.installed.slug,
        description: target.installed.description,
        body: target.installed.body,
        iconUrl: target.installed.iconUrl,
        gallery: target.installed.gallery,
      });
      await removeReplacedVersion(target.installed, next);
      repaired.push(target.name);
      await reconcileRequiredModVersions(onStatus);
      changed = true;
      break;
    }

    if (changed) continue;

    const issue = issues[0];
    if (issue.targetId === "java") throw new Error(`${issue.source.name} требует Java ${constraintText(issue.constraint)}; выбрана Java ${javaMajor}. Измените Java в настройках экземпляра.`);
    const relation =
      issue.kind === "missing"
        ? "требует отсутствующий мод"
        : issue.kind === "version"
          ? "требует версию"
          : "несовместим с";
    const target =
      issue.target?.name ||
      issue.target?.installed.title ||
      issue.targetId;
    throw new Error(
      `${issue.source.name} ${relation} ${target} (${constraintText(issue.constraint)}). Для этой комбинации Modrinth не предлагает совместимую версию.`,
    );
  }

  throw new Error(
    "Не удалось собрать совместимый набор модов после нескольких попыток.",
  );
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

  async function compatibleInstalled(mod: InstalledMod): Promise<boolean> {
    if (!mod.enabled) return false;
    const descriptor = await readFabricModDescriptor(join(await modsDir(), mod.filename), mod);
    return Boolean(descriptor && satisfiesVersion(GAME.minecraftVersion, descriptor.depends.minecraft ?? "*")
      && satisfiesVersion(GAME.fabricLoader, descriptor.depends.fabricloader ?? "*"));
  }

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
    let already = byProject.get(id);
    if (
      already &&
      (!requestedVersionId || already.versionId === requestedVersionId) &&
      await compatibleInstalled(already)
    )
      return already;
    const details = await project(id);
    displayTitle = details.title || displayTitle;
    const inferred = inferredInstalled(displayTitle);
    if (inferred && await compatibleInstalled(inferred)) {
      const remembered = await attachMetadata(
        inferred,
        id,
        displayTitle,
        details,
      );
      byProject.set(id, remembered);
      return remembered;
    }
    already ??= inferred;
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
    await removeReplacedVersion(already, result);
    if (already) byFilename.delete(already.filename);
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

function emitPackProgress(
  channel: string,
  filename: string,
  progress: number,
  done: boolean,
  error?: string,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, {
      filename,
      progress,
      done,
      error,
    });
  }
}

async function packVersions(
  projectId: string,
  kind: PackKind,
): Promise<ModVersionFile[]> {
  const params: Record<string, string> = {
    game_versions: JSON.stringify([GAME.minecraftVersion]),
  };
  params.loaders = JSON.stringify([kind === "shader" ? "iris" : "minecraft"]);
  const raw = await api<RawVersion[]>(`/project/${projectId}/version`, params);
  return raw
    .map(versionFile)
    .filter((entry): entry is ModVersionFile => Boolean(entry));
}

type PackKind = "resourcepack" | "shader";

function packConfig(kind: PackKind): {
  directory: () => Promise<string>;
  metadata: string;
  progressChannel: string;
  label: string;
} {
  return kind === "shader"
    ? {
        directory: shaderPacksDir,
        metadata: ".royale-shaders.json",
        progressChannel: IPC.shaderProgress,
        label: "шейдер",
      }
    : {
        directory: resourcePacksDir,
        metadata: ".royale-resources.json",
        progressChannel: IPC.resourceProgress,
        label: "ресурспак",
      };
}

async function installPackFile(
  kind: PackKind,
  version: ModVersionFile,
  details: ModProject,
): Promise<InstalledResourcePack | InstalledShaderPack> {
  const config = packConfig(kind);
  if (basename(version.filename) !== version.filename)
    throw new Error(
      `Modrinth вернул некорректное имя файла (${config.label}).`,
    );
  const dir = await config.directory();
  await fs.mkdir(dir, { recursive: true });
  const destination = join(dir, version.filename);
  const temporary = `${destination}.part`;
  emitPackProgress(config.progressChannel, version.filename, 0, false);
  try {
    await downloadVerifiedArchive(version, temporary, (progress) =>
      emitPackProgress(
        config.progressChannel,
        version.filename,
        progress,
        false,
      ),
    );
    await replaceDownloadedFile(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    emitPackProgress(
      config.progressChannel,
      version.filename,
      0,
      true,
      "Ошибка загрузки",
    );
    throw error;
  }
  const metadata = await readMetadata(dir, config.metadata);
  metadata[version.filename] = {
    sha1: version.sha1,
    expectedSize: version.size,
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
  await writeMetadata(dir, metadata, config.metadata);
  emitPackProgress(config.progressChannel, version.filename, 1, true);
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
  const compatible = (await packVersions(projectId, "resourcepack"))[0];
  if (!compatible)
    throw new Error(
      `Для ${details.title} нет версии под Minecraft ${GAME.minecraftVersion}.`,
    );
  return installPackFile(
    "resourcepack",
    compatible,
    details,
  ) as Promise<InstalledResourcePack>;
}

async function listPacks(
  kind: PackKind,
): Promise<Array<InstalledResourcePack | InstalledShaderPack>> {
  const config = packConfig(kind);
  const dir = await config.directory();
  if (!existsSync(dir)) return [];
  const metadata = await readMetadata(dir, config.metadata);
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

async function removePack(kind: PackKind, filename: string): Promise<void> {
  const config = packConfig(kind);
  if (basename(filename) !== filename)
    throw new Error(`Некорректное имя файла (${config.label}).`);
  const dir = await config.directory();
  await fs.rm(join(dir, filename), { force: true });
  const metadata = await readMetadata(dir, config.metadata);
  delete metadata[filename];
  await writeMetadata(dir, metadata, config.metadata);
}

async function revealPack(kind: PackKind, filename: string): Promise<void> {
  const config = packConfig(kind);
  if (basename(filename) !== filename)
    throw new Error(`Некорректное имя файла (${config.label}).`);
  const dir = await config.directory();
  const target = join(dir, filename);
  if (existsSync(target)) shell.showItemInFolder(target);
  else await shell.openPath(dir);
}

export async function listResourcePacks(): Promise<InstalledResourcePack[]> {
  return listPacks("resourcepack") as Promise<InstalledResourcePack[]>;
}

export function removeResourcePack(filename: string): Promise<void> {
  return removePack("resourcepack", filename);
}

export function revealResourcePack(filename: string): Promise<void> {
  return revealPack("resourcepack", filename);
}

export async function installShaderProject(
  projectId: string,
): Promise<InstalledShaderPack> {
  const existing = await listShaderPacks();
  const installed = existing.find((pack) => pack.projectId === projectId);
  if (installed) return installed;
  const details = await project(projectId);
  if (details.project_type !== "shader")
    throw new Error("Выбранный проект не является шейдерпаком.");
  const compatible = (await packVersions(projectId, "shader"))[0];
  if (!compatible)
    throw new Error(
      `Для ${details.title} нет версии под Minecraft ${GAME.minecraftVersion}.`,
    );
  return installPackFile(
    "shader",
    compatible,
    details,
  ) as Promise<InstalledShaderPack>;
}

export async function listShaderPacks(): Promise<InstalledShaderPack[]> {
  return listPacks("shader") as Promise<InstalledShaderPack[]>;
}

export function removeShaderPack(filename: string): Promise<void> {
  return removePack("shader", filename);
}

export function revealShaderPack(filename: string): Promise<void> {
  return revealPack("shader", filename);
}

export async function listInstalled(
  enrichCatalogMetadata = true,
): Promise<InstalledMod[]> {
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
  for (const mod of enrichCatalogMetadata ? result : []) {
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
