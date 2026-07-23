import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import type {
  AppSettings,
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
    microsoftClientId: "",
  };
}

function defaultState(): PersistShape {
  return {
    settings: defaultSettings(),
    accounts: [],
    activeAccountId: null,
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
    if (
      !cache.settings.backgroundMediaPath &&
      cache.settings.backgroundImagePath
    ) {
      cache.settings.backgroundMediaPath = cache.settings.backgroundImagePath;
    }
    if ((cache.settings.language as string) === "uk")
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
  state.accounts = accounts;
  state.activeAccountId = activeAccountId;
  await persist();
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
  return state.settings.storagePath;
}

export async function modsDir(): Promise<string> {
  return join(await gameDir(), "mods");
}

export async function resourcePacksDir(): Promise<string> {
  return join(await gameDir(), "resourcepacks");
}

export function targetVersionId(): string {
  return `fabric-loader-${GAME.fabricLoader}-${GAME.minecraftVersion}`;
}
