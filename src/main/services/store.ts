import { app } from "electron";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { dirname, join, relative, resolve } from "path";
import type {
  AppSettings,
  GameInstance,
  PersistShape,
  StoredAccount,
  LauncherStats,
  Friend,
} from "../../shared/types";
import { GAME } from "../../shared/constants";
import { syncAppearanceManifest } from "./appearance-export";

/**
 * Tiny JSON-file persistence in Electron's userData dir. Atomic writes via a
 * temp file + rename so a crash mid-write can't corrupt the config.
 */

const CONFIG_FILE = () => join(app.getPath("userData"), "vela-config.json");
const LEGACY_CONFIG_FILE = () =>
  join(app.getPath("userData"), "royale-config.json");
const DEFAULT_STORAGE_PATH = () => join(app.getPath("appData"), ".vela");
const LEGACY_STORAGE_PATH = () => join(app.getPath("appData"), ".royale");
export const DEFAULT_INSTANCE_ID = "vela-main";
export const MAX_INSTANCES = 4;

function defaultInstance(): GameInstance {
  return {
    id: DEFAULT_INSTANCE_ID,
    name: "Vela",
    minecraftVersion: GAME.minecraftVersion,
    directory: "",
    source: "default",
    iconDataUrl: null,
    pinned: true,
    createdAt: 0,
    sharedFolders: {
      worlds: false,
      resourcePacks: false,
      shaderPacks: false,
    },
  };
}

function defaultSettings(): AppSettings {
  return {
    language: "ru",
    storagePath: DEFAULT_STORAGE_PATH(),
    telemetry: false,
    gpuDedicated: true,
    gpuProfile: "auto",
    discordRpc: true,
    devMode: false,
    streamerMode: false,
    quickLaunch: false,
    preLaunchCommand: "",
    minecraftArgs: "",
    environmentVariables: "",
    authlibInjector: false,
    elyAuthlib: false,
    replaceNativeLibraries: "old-only",
    autoInstallJava: true,
    onboardingCompleted: false,
    memoryAuto: true,
    memoryMode: "auto",
    memoryMinMb: 2048,
    memoryMb: 4096,
    jvmArgs: "",
    closeOnLaunch: false,
    showLog: true,
    javaPath: null,
    backgroundImagePath: null,
    backgroundMediaPath: null,
    backgroundFit: "cover",
    galleryImagePaths: [],
    confirmAccountDelete: true,
    confirmModDelete: true,
  };
}

function defaultState(): PersistShape {
  return {
    settings: defaultSettings(),
    accounts: [],
    activeAccountId: null,
    instances: [defaultInstance()],
    activeInstanceId: DEFAULT_INSTANCE_ID,
    friends: [],
    stats: {
      playtimeMinutes: 0,
      lastPlayed: null,
      installed: false,
      installedCommitSha: null,
      installedClientVersion: null,
      lastUpdateCheck: null,
    },
  };
}

let cache: PersistShape | null = null;
let loading: Promise<PersistShape> | null = null;
let persistenceQueue: Promise<void> = Promise.resolve();

async function readPersistedState(): Promise<{
  parsed: Partial<PersistShape>;
  legacyConfig: boolean;
}> {
  try {
    return {
      parsed: JSON.parse(await fs.readFile(CONFIG_FILE(), "utf-8")),
      legacyConfig: false,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      return {
        parsed: JSON.parse(await fs.readFile(LEGACY_CONFIG_FILE(), "utf-8")),
        legacyConfig: true,
      };
    } catch (legacyError) {
      if ((legacyError as NodeJS.ErrnoException).code !== "ENOENT")
        throw legacyError;
      return { parsed: defaultState(), legacyConfig: false };
    }
  }
}

export async function migrateLegacyStorage(
  configuredPath: string,
  legacy = LEGACY_STORAGE_PATH(),
  target = DEFAULT_STORAGE_PATH(),
): Promise<string> {
  const normalize = (path: string): string => resolve(path).toLowerCase();
  if (normalize(configuredPath) !== normalize(legacy)) return configuredPath;
  try {
    await fs.access(legacy);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return target;
  }
  // Promote only a complete copy. Both the source and any pre-existing Vela
  // directory remain recoverable, including after an interrupted migration.
  const staging = `${target}-migration-${randomUUID()}`;
  await fs.cp(legacy, staging, {
    recursive: true,
    force: false,
    errorOnExist: true,
    verbatimSymlinks: true,
  });
  const remapSharedLinks = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const linked = resolve(dirname(path), await fs.readlink(path));
        const nested = relative(legacy, linked);
        if (!nested.startsWith("..") && !nested.includes(":")) {
          await fs.unlink(path);
          await fs.symlink(join(target, nested), path, "junction");
        }
      } else if (entry.isDirectory()) {
        await remapSharedLinks(path);
      }
    }
  };
  await remapSharedLinks(staging);
  let previous: string | null = null;
  try {
    await fs.access(target);
    previous = `${target}-before-migration-${randomUUID()}`;
    await fs.rename(target, previous);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await fs.rename(staging, target);
  } catch (error) {
    if (previous) await fs.rename(previous, target);
    throw error;
  }
  return target;
}

export async function loadState(): Promise<PersistShape> {
  if (loading) return loading;
  if (cache) return cache;
  loading = initializeState();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

async function initializeState(): Promise<PersistShape> {
  try {
    const { parsed, legacyConfig } = await readPersistedState();
    let needsPersist = legacyConfig;
    // merge so new default keys appear for old configs
    cache = {
      ...defaultState(),
      ...parsed,
      settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
      stats: { ...defaultState().stats, ...(parsed.stats ?? {}) },
    };
    const savedInstances = Array.isArray(parsed.instances)
      ? parsed.instances.slice(0, MAX_INSTANCES)
      : [];
    cache.instances = savedInstances.length
      ? savedInstances.map((instance) => ({
          ...defaultInstance(),
          ...instance,
          id:
            instance.id === "royale-master"
              ? DEFAULT_INSTANCE_ID
              : instance.id,
          name:
            instance.name === "Royale Master" || instance.name === "Royale"
              ? "Vela"
              : instance.name,
          minecraftVersion: GAME.supportedMinecraftVersions.some(
            (version) => version === instance.minecraftVersion,
          )
            ? instance.minecraftVersion
            : GAME.minecraftVersion,
          sharedFolders: {
            ...defaultInstance().sharedFolders,
            ...(instance.sharedFolders ?? {}),
          },
        }))
      : [defaultInstance()];
    const parsedActiveId =
      parsed.activeInstanceId === "royale-master"
        ? DEFAULT_INSTANCE_ID
        : parsed.activeInstanceId;
    cache.activeInstanceId =
      cache.instances.find((item) => item.id === parsedActiveId)?.id ??
      cache.instances[0].id;
    cache.accounts = Array.isArray(cache.accounts) ? cache.accounts : [];
    const savedActiveAccountId = cache.activeAccountId;
    cache.activeAccountId =
      cache.accounts.find((item) => item.id === savedActiveAccountId)?.id ??
      cache.accounts[0]?.id ??
      null;
    if (
      !cache.settings.backgroundMediaPath &&
      cache.settings.backgroundImagePath
    ) {
      cache.settings.backgroundMediaPath = cache.settings.backgroundImagePath;
    }
    if ((cache.settings.language as string) !== "ru")
      cache.settings.language = "ru";
    if (!parsed.settings || !("memoryMode" in parsed.settings)) {
      cache.settings.memoryMode = cache.settings.memoryAuto ? "auto" : "manual";
    }
    if (parsed.settings && !("onboardingCompleted" in parsed.settings)) {
      cache.settings.onboardingCompleted = true;
    }
    if (
      cache.settings.jvmArgs ===
      "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200"
    ) {
      cache.settings.jvmArgs = "";
    }
    const defaults = defaultSettings();
    cache.settings = { ...defaults, ...cache.settings };
    const migratedStoragePath = await migrateLegacyStorage(
      cache.settings.storagePath,
    );
    if (migratedStoragePath !== cache.settings.storagePath) {
      const previousRoot = cache.settings.storagePath;
      const remap = (value: string | null | undefined): string | null => {
        if (!value) return null;
        const tail = relative(resolve(previousRoot), resolve(value));
        return !tail.startsWith("..") && !tail.includes(":") ? join(migratedStoragePath, tail) : value;
      };
      cache.settings.javaPath = remap(cache.settings.javaPath);
      cache.settings.backgroundImagePath = remap(cache.settings.backgroundImagePath);
      cache.settings.backgroundMediaPath = remap(cache.settings.backgroundMediaPath);
      cache.settings.galleryImagePaths = cache.settings.galleryImagePaths.map(path => remap(path) ?? path);
      for (const instance of cache.instances) if (instance.javaPath) instance.javaPath = remap(instance.javaPath);
      cache.settings.storagePath = migratedStoragePath;
      needsPersist = true;
    }
    cache.stats = {
      installedCommitSha: null,
      installedClientVersion: null,
      lastUpdateCheck: null,
      ...cache.stats,
    };
    if (needsPersist || JSON.stringify(cache) !== JSON.stringify(parsed))
      await persist();
  } catch (error) {
    cache = null;
    throw new Error("Не удалось прочитать или перенести данные Vela. Исходные файлы сохранены.", { cause: error });
  }
  return cache!;
}

async function persist(): Promise<void> {
  if (!cache) return;
  const file = CONFIG_FILE();
  const snapshot = JSON.stringify(cache, null, 2);
  const write = persistenceQueue.catch(() => undefined).then(async () => {
    await fs.mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, snapshot, "utf-8");
    await fs.rename(tmp, file);
  });
  persistenceQueue = write;
  await write;
}

async function prepareSharedFolders(state: PersistShape): Promise<void> {
  const instance = state.instances.find(
    (item) => item.id === state.activeInstanceId,
  );
  if (!instance?.directory) return;
  const instanceRoot = join(
    state.settings.storagePath,
    "instances",
    instance.directory,
  );
  const mappings = [
    ["worlds", "saves"],
    ["resourcePacks", "resourcepacks"],
    ["shaderPacks", "shaderpacks"],
  ] as const;
  await fs.mkdir(instanceRoot, { recursive: true });
  for (const [setting, folder] of mappings) {
    if (!instance.sharedFolders[setting]) continue;
    const shared = join(state.settings.storagePath, folder);
    const local = join(instanceRoot, folder);
    await fs.mkdir(shared, { recursive: true });
    try {
      const info = await fs.lstat(local);
      if (info.isSymbolicLink()) continue;
      if (!info.isDirectory() || (await fs.readdir(local)).length) continue;
      await fs.rmdir(local);
    } catch {
      /* The local folder does not exist yet. */
    }
    try {
      await fs.symlink(shared, local, "junction");
    } catch {
      /* A regular folder created concurrently remains a safe local fallback. */
    }
  }
}

export async function saveSettings(
  settings: AppSettings,
): Promise<PersistShape> {
  const state = await loadState();
  state.settings = settings;
  await persist();
  await syncAppearanceManifest(state.settings.storagePath, state.accounts);
  return state;
}

export async function saveAccounts(
  accounts: StoredAccount[],
  activeAccountId: string | null,
): Promise<PersistShape> {
  const state = await loadState();
  state.accounts = accounts.slice(0, 6);
  state.activeAccountId =
    state.accounts.find((item) => item.id === activeAccountId)?.id ??
    state.accounts[0]?.id ??
    null;
  await persist();
  await syncAppearanceManifest(state.settings.storagePath, state.accounts);
  return state;
}

export async function saveInstances(
  instances: GameInstance[],
  activeInstanceId: string,
): Promise<PersistShape> {
  const state = await loadState();
  const normalized = instances.slice(0, MAX_INSTANCES).map((instance) => ({
    ...instance,
    minecraftVersion: GAME.supportedMinecraftVersions.some(
      (version) => version === instance.minecraftVersion,
    )
      ? instance.minecraftVersion
      : GAME.minecraftVersion,
  }));
  if (!normalized.length) normalized.push(defaultInstance());
  state.instances = normalized;
  state.activeInstanceId =
    normalized.find((item) => item.id === activeInstanceId)?.id ??
    normalized[0].id;
  await persist();
  await prepareSharedFolders(state);
  return state;
}

export async function saveFriends(friends: Friend[]): Promise<PersistShape> {
  const state = await loadState();
  state.friends = friends;
  await persist();
  return state;
}

export async function recordPlaytime(minutes: number): Promise<void> {
  const state = await loadState();
  state.stats.playtimeMinutes += Math.max(0, minutes);
  state.stats.lastPlayed = Date.now();
  await persist();
}

export async function updateStats(
  patch: Partial<LauncherStats>,
): Promise<LauncherStats> {
  const state = await loadState();
  state.stats = { ...state.stats, ...patch };
  await persist();
  return state.stats;
}

/** Absolute path to the game data dir (where versions/mods/assets live). */
export async function gameDir(): Promise<string> {
  const state = await loadState();
  const instance =
    state.instances.find((item) => item.id === state.activeInstanceId) ??
    state.instances[0];
  return instance?.directory
    ? join(state.settings.storagePath, "instances", instance.directory)
    : state.settings.storagePath;
}

export async function activeInstance(): Promise<GameInstance> {
  const state = await loadState();
  return (
    state.instances.find((item) => item.id === state.activeInstanceId) ??
    state.instances[0]
  );
}

export async function instanceDir(id: string): Promise<string> {
  const state = await loadState();
  const instance = state.instances.find((item) => item.id === id);
  if (!instance) throw new Error("Экземпляр не найден.");
  return instance.directory
    ? join(state.settings.storagePath, "instances", instance.directory)
    : state.settings.storagePath;
}

export async function createImportedInstance(
  name: string,
): Promise<GameInstance> {
  const state = await loadState();
  if (state.instances.length >= MAX_INSTANCES) {
    throw new Error("Можно создать не больше 4 экземпляров.");
  }
  const id = `instance-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const instance: GameInstance = {
    id,
    name: name.trim() || "Импортированная сборка",
    minecraftVersion: GAME.minecraftVersion,
    directory: id,
    source: "imported",
    iconDataUrl: null,
    pinned: false,
    createdAt: Date.now(),
    sharedFolders: {
      worlds: false,
      resourcePacks: false,
      shaderPacks: false,
    },
  };
  state.instances.push(instance);
  state.activeInstanceId = id;
  await persist();
  await fs.mkdir(join(state.settings.storagePath, "instances", id), {
    recursive: true,
  });
  return instance;
}

export async function removeInstance(
  id: string,
  preferredActiveId?: string,
): Promise<void> {
  const state = await loadState();
  const instance = state.instances.find((item) => item.id === id);
  if (!instance || instance.id === DEFAULT_INSTANCE_ID) return;
  state.instances = state.instances.filter((item) => item.id !== id);
  if (state.activeInstanceId === id) {
    state.activeInstanceId =
      state.instances.find((item) => item.id === preferredActiveId)?.id ??
      state.instances[0]?.id ??
      DEFAULT_INSTANCE_ID;
  }
  await persist();
}

export async function duplicateInstance(id: string): Promise<PersistShape> {
  const state = await loadState();
  if (state.instances.length >= MAX_INSTANCES) {
    throw new Error("Можно создать не больше 4 экземпляров.");
  }
  const source = state.instances.find((item) => item.id === id);
  if (!source) throw new Error("Экземпляр не найден.");
  const copyId = `instance-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const copy: GameInstance = {
    ...source,
    id: copyId,
    name: `${source.name} — копия`,
    directory: copyId,
    source: "created",
    pinned: false,
    createdAt: Date.now(),
    sharedFolders: { ...source.sharedFolders },
  };
  const sourceRoot = source.directory
    ? join(state.settings.storagePath, "instances", source.directory)
    : state.settings.storagePath;
  const destination = join(state.settings.storagePath, "instances", copyId);
  const excludedAtRoot = new Set(["instances", "jre", ".launcher-cache"]);
  await fs.mkdir(dirname(destination), { recursive: true });
  try {
    await fs.cp(sourceRoot, destination, {
      recursive: true,
      force: false,
      errorOnExist: false,
      filter: (path) => {
        const relative = path.slice(sourceRoot.length).replace(/^[\\/]+/, "");
        const first = relative.split(/[\\/]/)[0].toLowerCase();
        return !excludedAtRoot.has(first);
      },
    });
    state.instances.push(copy);
    state.activeInstanceId = copy.id;
    await persist();
    await prepareSharedFolders(state);
    return state;
  } catch (error) {
    const instancesRoot = resolve(state.settings.storagePath, "instances");
    const relativeDestination = relative(instancesRoot, resolve(destination));
    if (
      relativeDestination &&
      !relativeDestination.startsWith("..") &&
      !relativeDestination.includes(":")
    ) {
      await fs.rm(destination, { recursive: true, force: true });
    }
    throw error;
  }
}

export async function modsDir(): Promise<string> {
  return join(await gameDir(), "mods");
}

export async function resourcePacksDir(): Promise<string> {
  return join(await gameDir(), "resourcepacks");
}

export async function shaderPacksDir(): Promise<string> {
  return join(await gameDir(), "shaderpacks");
}

export function targetVersionId(): string {
  return `fabric-loader-${GAME.fabricLoader}-${GAME.minecraftVersion}`;
}
