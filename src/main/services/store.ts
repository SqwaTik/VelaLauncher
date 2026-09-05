import { app } from "electron";
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

/**
 * Tiny JSON-file persistence in Electron's userData dir. Atomic writes via a
 * temp file + rename so a crash mid-write can't corrupt the config.
 */

const CONFIG_FILE = () => join(app.getPath("userData"), "royale-config.json");
export const DEFAULT_INSTANCE_ID = "royale-master";
export const MAX_INSTANCES = 4;

function defaultInstance(): GameInstance {
  return {
    id: DEFAULT_INSTANCE_ID,
    name: "Vela",
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
    storagePath: join(app.getPath("appData"), ".royale"),
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

export async function loadState(): Promise<PersistShape> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(CONFIG_FILE(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistShape>;
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
          name:
            instance.name === "Royale Master" || instance.name === "Royale"
              ? "Vela"
              : instance.name,
          sharedFolders: {
            ...defaultInstance().sharedFolders,
            ...(instance.sharedFolders ?? {}),
          },
        }))
      : [defaultInstance()];
    cache.activeInstanceId =
      cache.instances.find((item) => item.id === parsed.activeInstanceId)?.id ??
      cache.instances[0].id;
    cache.accounts = (cache.accounts ?? []).filter(
      (account) => account.type !== "microsoft",
    );
    cache.activeAccountId =
      cache.accounts.find((item) => item.id === cache.activeAccountId)?.id ??
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
    cache.stats = {
      installedCommitSha: null,
      installedClientVersion: null,
      lastUpdateCheck: null,
      ...cache.stats,
    };
  } catch {
    cache = defaultState();
  }
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  const file = CONFIG_FILE();
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cache, null, 2), "utf-8");
  await fs.rename(tmp, file);
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
  return state;
}

export async function saveInstances(
  instances: GameInstance[],
  activeInstanceId: string,
): Promise<PersistShape> {
  const state = await loadState();
  const normalized = instances.slice(0, MAX_INSTANCES);
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
